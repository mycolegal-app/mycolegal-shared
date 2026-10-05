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
    if (!l) { l = { nombre, subcampos: new Map() }; listas.set(nombre, l); }
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
    for (const n of nombresDe(dentro)) {
      const N = n.toUpperCase(); const [cabeza, sub] = N.split('.');
      const b = sub ? bucleDe(cabeza) : null;
      if (b) {
        const l = lista(b.lista);
        if (!l.subcampos.has(sub)) l.subcampos.set(sub, 'TEXT');
        enElemento.add(N);
      } else if (vinc && !N.includes('.')) {
        const l = lista(vinc.lista);
        if (!l.subcampos.has(N)) l.subcampos.set(N, 'TEXT');
        enElemento.add(N);
      } else {
        fueraDeElemento.add(N);
      }
    }
  }
  const soloDeElemento = new Set([...enElemento].filter((n) => !fueraDeElemento.has(n)));
  return { listas, soloDeElemento };
}
