// Listas de una plantilla, deducidas de cómo se usan (5-oct-2026).
//
// Una lista es el array que recorre un `{{FOR EACH IT IN LISTA}}`. Sus
// subcampos son los que la plantilla usa de verdad dentro del bucle:
//   · las referencias `{{IT.X}}` (y `{{IT.X.Y}}`, que aporta X);
//   · los campos de un párrafo vinculado al elemento —`INCLUDE P(IT)` o
//     `INCLUDE P FIELDS:(IT)`—, que el motor resuelve contra el elemento.
// Deducirlos evita declarar a mano 45 listas que se desalinean de la plantilla
// (y la mitad de la biblioteca no las declaraba). Un bucle anidado
// `FOR EACH IT IN PADRE.SUB` aporta `SUB` como subcampo de tipo LIST del padre.

export interface ListaDeducida {
  nombre: string;
  /** subcampo → tipo ('TEXT' | 'LIST') */
  subcampos: Map<string, string>;
  /** Subcampos que gobiernan un IF dentro del bucle: deciden qué más se pide. */
  condiciones: Set<string>;
}

export interface ResultadoListas {
  listas: Map<string, ListaDeducida>;
  /** Nombres que sólo aparecen como dato de un elemento: no son campos globales. */
  soloDeElemento: Set<string>;
}

const RESERVADAS = new Set(['IF', 'ELSE', 'ENDIF', 'AND', 'OR', 'NOT', 'IN', 'TRUE', 'FALSE', 'COUNT', 'FOR', 'EACH', 'ENDFOR', 'END']);
const NO_CAMPO = /^\s*(?:DECLARE|COMMENT|INCLUDE|TAGS|SUMMARY|DEPENDENCY|MAP_IUI|HUMAN_ACTION|END_HUMAN_ACTION|LANG|WORD_STYLE|@autonumber|AUTO[:(]|SYSTEM:|EXIT_INCLUDE|SET\s)/i;
const BIND_BEGIN = /\x00BIND:([\wÀ-ɏ]+)\x00/y;

function nombresDe(dentro: string): string[] {
  const sinLiterales = dentro.replace(/"[^"]*"|'[^']*'|“[^”]*”|«[^»]*»/g, ' ');
  // `{{CAMPO:INPUT(...)}}` / `{{CAMPO:[...]}}`: sólo cuenta lo de antes de los dos puntos.
  const cabeza = /^\s*IF[\s_]/i.test(sinLiterales) ? sinLiterales : sinLiterales.split(':')[0];
  return [...cabeza.matchAll(/(?:^|[^\w.@])([A-Za-z_][\wÀ-ɏ]*(?:\.[A-Za-z_][\wÀ-ɏ]*)*)(?![\w(])/g)]
    .map((m) => m[1]).filter((n) => !RESERVADAS.has(n.toUpperCase().split('.')[0]) || n.includes('.'));
}

export function listasDeLaPlantilla(texto: string): ResultadoListas {
  const listas = new Map<string, ListaDeducida>();
  const enElemento = new Set<string>();
  const fueraDeElemento = new Set<string>();
  const bucles: { it: string; lista: string }[] = [];
  const vinculos: string[] = [];

  const lista = (nombre: string): ListaDeducida => {
    let l = listas.get(nombre);
    if (!l) { l = { nombre, subcampos: new Map(), condiciones: new Set() }; listas.set(nombre, l); }
    return l;
  };
  const bucleDe = (it: string) => { for (let i = bucles.length - 1; i >= 0; i--) if (bucles[i].it === it) return bucles[i]; return null; };

  const re = /\x00BIND:([\wÀ-ɏ]+)\x00|\x00\/BIND\x00|\{\{([^{}]*)\}\}/g;
  for (const m of texto.matchAll(re)) {
    if (m[1] !== undefined) { vinculos.push(m[1].toUpperCase()); continue; }
    if (m[0].startsWith('\x00/BIND')) { vinculos.pop(); continue; }
    const dentro = (m[2] ?? '').trim();
    const fe = dentro.match(/^FOR\s+EACH\s+([\wÀ-ɏ]+)\s+IN\s+([\w.À-ɏ]+)(\|ENUM)?\s*$/i);
    if (fe) {
      const it = fe[1].toUpperCase(); let nombre = fe[2].toUpperCase();
      const [cabeza, ...resto] = nombre.split('.');
      const padre = resto.length ? bucleDe(cabeza) : null;
      if (padre) { lista(padre.lista).subcampos.set(resto[0], 'LIST'); nombre = `${padre.lista}.${resto.join('.')}`; }
      lista(nombre); bucles.push({ it, lista: nombre });
      continue;
    }
    if (/^(ENDFOR|END[\s_]+FOR)\s*$/i.test(dentro)) { bucles.pop(); continue; }
    if (NO_CAMPO.test(dentro) || /^(ELSE|ENDIF)\b/i.test(dentro)) continue;
    const vinc = vinculos.length ? bucleDe(vinculos[vinculos.length - 1]) : null;
    const esCondicion = /^IF[\s_]/i.test(dentro);
    for (const n of nombresDe(dentro)) {
      const N = n.toUpperCase(); const [cabeza, sub] = N.split('.');
      const b = sub ? bucleDe(cabeza) : null;
      if (b) {
        const l = lista(b.lista);
        if (!l.subcampos.has(sub)) l.subcampos.set(sub, 'TEXT');
        if (esCondicion) l.condiciones.add(sub);
        enElemento.add(N);
      } else if (vinc && !N.includes('.')) {
        const l = lista(vinc.lista);
        if (!l.subcampos.has(N)) l.subcampos.set(N, 'TEXT');
        if (esCondicion) l.condiciones.add(N);
        enElemento.add(N);
      } else {
        fueraDeElemento.add(N);
      }
    }
  }
  const soloDeElemento = new Set([...enElemento].filter((n) => !fueraDeElemento.has(n)));
  return { listas, soloDeElemento };
}

/**
 * La plantilla preparada para SONDAR listas (F5.25).
 *
 * La app compone con centinelas para saber qué se pide; con las listas eso no
 * basta, porque (a) un bucle cuyo cuerpo sólo tiene condiciones no imprime
 * ningún centinela de dato, y (b) una condición del elemento sólo hay que
 * preguntarla si su `IF` se alcanza para ESE elemento. Esta función inserta
 * testigos de texto que el compositor imprime sólo si se alcanzan:
 *   · `«L:LISTA»` justo tras cada `{{FOR EACH … IN LISTA}}`;
 *   · `«C:LISTA:SUB1,SUB2»` justo antes de cada `{{IF}}` que use subcampos
 *     del elemento (por `IT.SUB` o dentro de un párrafo vinculado).
 */
export function marcarListasParaSonda(texto: string): string {
  const bucles: { it: string; lista: string }[] = [];
  const vinculos: string[] = [];
  const bucleDe = (it: string) => { for (let i = bucles.length - 1; i >= 0; i--) if (bucles[i].it === it) return bucles[i]; return null; };
  const re = /\x00BIND:([\wÀ-ɏ]+)\x00|\x00\/BIND\x00|\{\{([^{}]*)\}\}/g;
  let out = ''; let cursor = 0;
  for (const m of texto.matchAll(re)) {
    const ini = m.index!; const fin = ini + m[0].length;
    if (m[1] !== undefined) { vinculos.push(m[1].toUpperCase()); continue; }
    if (m[0].startsWith('\x00/BIND')) { vinculos.pop(); continue; }
    const dentro = (m[2] ?? '').trim();
    const fe = dentro.match(/^FOR\s+EACH\s+([\wÀ-ɏ]+)\s+IN\s+([\w.À-ɏ]+)(\|ENUM)?\s*$/i);
    if (fe) {
      const it = fe[1].toUpperCase(); let nombre = fe[2].toUpperCase();
      const [cabeza, ...resto] = nombre.split('.');
      const padre = resto.length ? bucleDe(cabeza) : null;
      if (padre) nombre = `${padre.lista}.${resto.join('.')}`;
      bucles.push({ it, lista: nombre });
      out += texto.slice(cursor, fin) + `«L:${nombre}»`; cursor = fin;
      continue;
    }
    if (/^(ENDFOR|END[\s_]+FOR)\s*$/i.test(dentro)) { bucles.pop(); continue; }
    if (!/^IF[\s_]/i.test(dentro)) continue;
    const vinc = vinculos.length ? bucleDe(vinculos[vinculos.length - 1]) : null;
    const porLista = new Map<string, Set<string>>();
    for (const n of nombresDe(dentro)) {
      const N = n.toUpperCase(); const [cabeza, sub] = N.split('.');
      const b = sub ? bucleDe(cabeza) : null;
      const lista = b ? b.lista : (vinc && !N.includes('.') ? vinc.lista : null);
      const nombreSub = b ? sub : N;
      if (!lista) continue;
      if (!porLista.has(lista)) porLista.set(lista, new Set());
      porLista.get(lista)!.add(nombreSub);
    }
    if (porLista.size === 0) continue;
    const testigos = [...porLista].map(([l, subs]) => `«C:${l}:${[...subs].join(',')}»`).join('');
    out += texto.slice(cursor, ini) + testigos + m[0]; cursor = fin;
  }
  return out + texto.slice(cursor);
}
