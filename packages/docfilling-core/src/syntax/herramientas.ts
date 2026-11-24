/**
 * Herramientas del motor en las plantillas: `SYSTEM:HERRAMIENTA<argumento>[.CAMPO][#formato]` (plan de herramientas del
 * motor, antes «DocFilling contactos», §4.5; sintaxis fijada por Carles el 24-nov-2026).
 *
 *   {{SYSTEM:CONTACT<EULISES>.TELEFONO}}            dato de un contacto de la notaría
 *   {{SYSTEM:CONTACT<[REPRESENTANTE]>.NOMBRE#upper}} con el selector en una variable
 *   SYSTEM:CONTACTS<tipo=GESTORIA>                  las opciones de una pregunta
 *   {{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}}              el resultado de un cálculo
 *   {{IF SYSTEM:COMPUTE<PLAZO(ITP_AJD)> > 0}}       … también en una condición
 *
 * EL PROBLEMA QUE RESUELVE ESTE FICHERO: `<` y `>` ya son operadores en las condiciones. Aquí se lee cada herramienta
 * como UNA pieza (los `< >` emparejados, con `( )` y `[ ]` dentro) ANTES de que nadie busque operadores, y se sustituye
 * por un identificador neutro (`__SYS_COMPUTE_1a2b3c4d`). Lo demás del motor ve un campo más: con valor se imprime, con
 * formato se formatea, sin valor sale el hueco visible. Sin tocar el resto del analizador.
 *
 * docfilling-core NO calcula ni busca contactos: lista lo que la plantilla pide (`herramientasReferidas`) y recibe el
 * resultado de quien compone (Redactor), en un mapa por clave canónica. La lista de HERRAMIENTAS es cerrada (sintaxis
 * del lenguaje); las FUNCIONES de COMPUTE las declara el catálogo y aquí sólo se validan contra la lista que se reciba.
 */

/** Las herramientas del lenguaje. Lista cerrada: añadir una es cambiar el lenguaje (y este fichero). */
export const HERRAMIENTAS = ['CONTACT', 'CONTACTS', 'COMPUTE'] as const;
export type Herramienta = (typeof HERRAMIENTAS)[number];

export interface UsoHerramienta {
  /** Posición en el texto (del `S` de `SYSTEM:` al último carácter del uso, campo incluido, sin el formato). */
  inicio: number;
  fin: number;
  /** El texto tal cual: `SYSTEM:COMPUTE<PLAZO(ITP_AJD)>`. */
  crudo: string;
  herramienta: string;
  /** Lo de dentro de los `< >`: `PLAZO(ITP_AJD)`, `EULISES`, `[REPRESENTANTE]`, `tipo=GESTORIA`. */
  argumento: string;
  /** El campo detrás del cierre (`TELEFONO`), sin el punto. */
  campo: string | null;
  /** Error de sintaxis (sin cerrar, herramienta desconocida…); el uso no se sustituye. */
  error: string | null;
}

const ID = /[A-Za-z_][A-Za-z0-9_]*/y;

/** Los usos de herramientas DENTRO de `{{ … }}`. Fuera de las llaves no hay lenguaje. */
export function leerHerramientas(texto: string): UsoHerramienta[] {
  const out: UsoHerramienta[] = [];
  let i = 0;
  while ((i = texto.indexOf('{{', i)) !== -1) {
    const cierre = texto.indexOf('}}', i + 2);
    if (cierre === -1) break;
    let j = i + 2;
    while ((j = texto.indexOf('SYSTEM:', j)) !== -1 && j < cierre) {
      const ini = j;
      ID.lastIndex = j + 7;
      const m = ID.exec(texto);
      if (!m || texto[ID.lastIndex] !== '<') { j += 7; continue; } // `SYSTEM:DATO`: no es herramienta
      const herramienta = m[0].toUpperCase();
      // Emparejar `<` … `>` con `( )` y `[ ]` dentro (y `>` dentro de paréntesis o corchetes no cierra).
      let k = ID.lastIndex + 1, prof = 1, par = 0, cor = 0;
      for (; k < cierre && prof > 0; k++) {
        const c = texto[k];
        if (c === '(') par++; else if (c === ')') par--;
        else if (c === '[') cor++; else if (c === ']') cor--;
        else if (c === '<' && !par && !cor) prof++;
        else if (c === '>' && !par && !cor) prof--;
      }
      if (prof > 0) {
        out.push({ inicio: ini, fin: cierre, crudo: texto.slice(ini, cierre), herramienta, argumento: texto.slice(ID.lastIndex + 1, cierre), campo: null,
          error: `«<» de ${herramienta} sin cerrar con «>»` });
        break;
      }
      const argumento = texto.slice(ID.lastIndex + 1, k - 1).trim();
      let fin = k, campo: string | null = null;
      const mc = /^\.([A-Za-z_][\w.]*)/.exec(texto.slice(k, cierre));
      if (mc) { campo = mc[1].toUpperCase(); fin = k + mc[0].length; }
      const error = !(HERRAMIENTAS as readonly string[]).includes(herramienta)
        ? `herramienta desconocida SYSTEM:${herramienta}<…> (las del lenguaje: ${HERRAMIENTAS.join(', ')})`
        : !argumento ? `SYSTEM:${herramienta}<> sin argumento` : null;
      out.push({ inicio: ini, fin, crudo: texto.slice(ini, fin), herramienta, argumento, campo, error });
      j = fin;
    }
    i = cierre + 2;
  }
  return out;
}

/** Sustituye `[VAR]` del argumento por su valor (`valores`); una variable sin valor deja el uso sin resolver (null). */
function resolverVariables(argumento: string, valores: Record<string, unknown>): string | null {
  let falta = false;
  const r = argumento.replace(/\[([A-Za-z_][\w.]*)\]/g, (_, v: string) => {
    const x = valores[v] ?? valores[v.toUpperCase()];
    if (x === undefined || x === null || String(x).trim() === '') { falta = true; return ''; }
    return String(x).trim();
  });
  return falta ? null : r;
}

/** La clave canónica de un uso, con las variables ya resueltas: `COMPUTE<PLAZO(ITP_AJD)>`, `CONTACT<EULISES>.TELEFONO`. */
export function claveHerramienta(herramienta: string, argumento: string, campo: string | null): string {
  return `${herramienta.toUpperCase()}<${argumento.replace(/\s+/g, '')}>${campo ? `.${campo.toUpperCase()}` : ''}`;
}

function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** El identificador neutro con el que el resto del motor ve un uso. */
export function idHerramienta(clave: string): string {
  return `__SYS_${clave.slice(0, clave.indexOf('<'))}_${hash8(clave)}`;
}

export interface HerramientaReferida {
  clave: string;
  herramienta: string;
  argumento: string;
  campo: string | null;
  /** Para COMPUTE: la función y sus parámetros (`PLAZO`, `['ITP_AJD']`). */
  funcion?: { nombre: string; parametros: string[] };
}

function funcionDe(argumento: string): { nombre: string; parametros: string[] } | null {
  const m = /^([A-Za-z_][\w]*)\s*\((.*)\)$/.exec(argumento.trim());
  if (!m) return null;
  return { nombre: m[1].toUpperCase(), parametros: m[2].trim() ? m[2].split(',').map((p) => p.trim()) : [] };
}

/** Lo que la plantilla pide a las herramientas, con las variables resueltas (lo que quien compone tiene que calcular). */
export function herramientasReferidas(texto: string, valores: Record<string, unknown> = {}): HerramientaReferida[] {
  const vistas = new Map<string, HerramientaReferida>();
  for (const u of leerHerramientas(texto)) {
    if (u.error) continue;
    const arg = resolverVariables(u.argumento, valores);
    if (arg === null) continue;
    const clave = claveHerramienta(u.herramienta, arg, u.campo);
    if (vistas.has(clave)) continue;
    const f = u.herramienta === 'COMPUTE' ? funcionDe(arg) : null;
    vistas.set(clave, { clave, herramienta: u.herramienta, argumento: arg, campo: u.campo, ...(f ? { funcion: f } : {}) });
  }
  return [...vistas.values()];
}

/**
 * El texto con cada herramienta cambiada por su identificador neutro, y los valores de esos identificadores
 * (`resultados`, por clave canónica; null o ausente = sin resolver → el campo queda vacío y sale el hueco visible).
 * Un uso con error o con una variable sin valor se cambia por un identificador sin valor: hueco, nunca texto roto.
 */
export function sustituirHerramientas(
  texto: string,
  valores: Record<string, unknown> = {},
  resultados: Record<string, string | null | undefined> = {},
): { texto: string; campos: Record<string, string>; nombres: Record<string, string> } {
  const usos = leerHerramientas(texto);
  if (!usos.length) return { texto, campos: {}, nombres: {} };
  const campos: Record<string, string> = {};
  const nombres: Record<string, string> = {};
  let out = '', desde = 0;
  for (const u of usos) {
    const arg = u.error ? null : resolverVariables(u.argumento, valores);
    const clave = arg === null ? `${u.herramienta}<${u.argumento}>?` : claveHerramienta(u.herramienta, arg, u.campo);
    const id = idHerramienta(clave);
    const v = arg === null ? null : resultados[clave];
    if (v !== null && v !== undefined) campos[id] = v;
    nombres[id] = u.crudo;
    out += texto.slice(desde, u.inicio) + id;
    desde = u.fin;
  }
  return { texto: out + texto.slice(desde), campos, nombres };
}

export interface DiagnosticoHerramienta { inicio: number; fin: number; codigo: string; mensaje: string }

/**
 * E930 herramienta desconocida o mal escrita · E931 «<» sin cerrar · E932 función de COMPUTE que el catálogo no declara ·
 * E933 función de COMPUTE con un número de parámetros distinto del declarado.
 */
export function diagnosticosHerramientas(
  texto: string,
  funcionesCompute?: ReadonlyMap<string, { parametros: number }> | null,
): DiagnosticoHerramienta[] {
  const out: DiagnosticoHerramienta[] = [];
  for (const u of leerHerramientas(texto)) {
    if (u.error) { out.push({ inicio: u.inicio, fin: u.fin, codigo: u.error.includes('sin cerrar') ? 'E931' : 'E930', mensaje: u.error }); continue; }
    if (u.herramienta !== 'COMPUTE' || !funcionesCompute) continue;
    const f = funcionDe(u.argumento);
    if (!f) { out.push({ inicio: u.inicio, fin: u.fin, codigo: 'E932', mensaje: `COMPUTE<${u.argumento}>: se espera FUNCION(parámetros)` }); continue; }
    const decl = funcionesCompute.get(f.nombre);
    if (!decl) out.push({ inicio: u.inicio, fin: u.fin, codigo: 'E932', mensaje: `COMPUTE<${f.nombre}(…)>: el catálogo no declara la función ${f.nombre}` });
    else if (decl.parametros !== f.parametros.length) {
      out.push({ inicio: u.inicio, fin: u.fin, codigo: 'E933', mensaje: `COMPUTE<${f.nombre}(…)>: ${f.parametros.length} parámetro(s); el catálogo declara ${decl.parametros}` });
    }
  }
  return out;
}
