// `{{LANG-SECTION xx}}` … `{{LANG-END}}` — las versiones de un párrafo en varias lenguas, en el mismo fichero
// (Carles, 4-nov-2026). No confundir con `{{LANG=xx}}`, que dice en qué lengua está redactado un esquema.
//
//     {{LANG-SECTION es}}
//     **Revocación.-** Revoca cualquier disposición anterior.
//     {{LANG-SECTION ca}}
//     **Revocació.-** Revoca qualsevol disposició anterior.
//     {{LANG-END}}
//
// LO QUE SE TRADUCE ES EL TEXTO, NO LA LÓGICA. Las casillas, las condiciones y los valores que comparan los IF
// son los mismos en todas las secciones; por eso `auditarSeccionesDeLengua` exige que todas tengan la misma
// ESTRUCTURA (mismos IF, INCLUDE y campos, en el mismo orden) y la carga de la biblioteca lo comprueba.
//
// Se resuelve FICHERO A FICHERO y ANTES de expandir sus INCLUDE (`expandirIncludes`): así un párrafo incluido
// dentro de una sección no queda anidado en ella, y sólo se expande lo de la lengua elegida. El texto fuera de
// las secciones vale para todas las lenguas. Sin sección en la lengua pedida sale el castellano y se cuenta en
// `sinSeccion`: quien llama decide (Redactor lo traduce). Un fichero sin secciones no cambia.
import { IDIOMA_POR_DEFECTO } from './template-lang';

const RE_ABRE = /\{\{\s*LANG-SECTION\s+([A-Za-z][A-Za-z0-9_-]*)\s*\}\}[ \t]*\n?/g;
const RE_MARCA = /\{\{\s*(LANG-SECTION\s+[A-Za-z][A-Za-z0-9_-]*|LANG-END)\s*\}\}[ \t]*\n?/g;

interface Bloque { inicio: number; fin: number; secciones: { idioma: string; texto: string }[] }

/** Los bloques bien cerrados y lo que no cuadra (cierre sin apertura, bloque sin cerrar). */
function leerBloques(texto: string): { bloques: Bloque[]; errores: string[] } {
  const bloques: Bloque[] = [];
  const errores: string[] = [];
  let actual: Bloque | null = null;
  let abierta: { idioma: string; desde: number } | null = null;
  for (const m of texto.matchAll(RE_MARCA)) {
    const i = m.index;
    const cuerpo = m[1].trim();
    if (cuerpo === 'LANG-END') {
      if (!actual || !abierta) { errores.push('{{LANG-END}} sin {{LANG-SECTION}} que cerrar'); continue; }
      actual.secciones.push({ idioma: abierta.idioma, texto: texto.slice(abierta.desde, i) });
      actual.fin = i + m[0].length;
      bloques.push(actual);
      actual = null; abierta = null;
      continue;
    }
    const idioma = cuerpo.split(/\s+/)[1].toLowerCase();
    if (!actual) actual = { inicio: i, fin: i, secciones: [] };
    else if (abierta) actual.secciones.push({ idioma: abierta.idioma, texto: texto.slice(abierta.desde, i) });
    abierta = { idioma, desde: i + m[0].length };
  }
  if (actual) errores.push(`{{LANG-SECTION ${abierta?.idioma ?? ''}}} sin {{LANG-END}}`);
  return { bloques, errores };
}

/** El texto en esa lengua. `sinSeccion`: los bloques que no la tienen y salen en castellano (o en la primera). */
export function resolverSeccionesDeLengua(texto: string, idioma: string = IDIOMA_POR_DEFECTO): { texto: string; sinSeccion: number } {
  RE_ABRE.lastIndex = 0;
  if (!RE_ABRE.test(texto)) return { texto, sinSeccion: 0 };
  const lengua = idioma.toLowerCase();
  const { bloques } = leerBloques(texto);
  let salida = '';
  let desde = 0;
  let sinSeccion = 0;
  for (const b of bloques) {
    const propia = b.secciones.find((s) => s.idioma === lengua);
    if (!propia) sinSeccion++;
    const elegida = propia ?? b.secciones.find((s) => s.idioma === IDIOMA_POR_DEFECTO) ?? b.secciones[0];
    salida += texto.slice(desde, b.inicio) + (elegida?.texto ?? '');
    desde = b.fin;
  }
  return { texto: salida + texto.slice(desde), sinSeccion };
}

/**
 * La estructura de una sección: sus directivas, sin el texto. De un `AUTO` sólo cuenta la pista (las formas se
 * traducen: «el testador|la testadora»), y de un campo el nombre con sus formatos.
 */
function estructura(texto: string): string[] {
  return [...texto.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => {
    const d = m[1].trim().replace(/\s+/g, ' ');
    const auto = d.match(/^AUTO(\([^)]*\))?\s*:/i);
    if (auto) return `AUTO${auto[1] ?? ''}`;
    return d.replace(/:\[[^\]]*\]/, '');
  });
}

/** Lo que no cuadra en las secciones de un fichero, en palabras. Vacío si está bien. */
export function auditarSeccionesDeLengua(texto: string): string[] {
  const { bloques, errores } = leerBloques(texto);
  const out = [...errores];
  bloques.forEach((b, n) => {
    const donde = bloques.length > 1 ? `Bloque ${n + 1}: ` : '';
    const lenguas = b.secciones.map((s) => s.idioma);
    const repetida = lenguas.find((l, i) => lenguas.indexOf(l) !== i);
    if (repetida) out.push(`${donde}la sección «${repetida}» está dos veces`);
    if (!lenguas.includes(IDIOMA_POR_DEFECTO)) out.push(`${donde}falta la sección «${IDIOMA_POR_DEFECTO}»`);
    const base = b.secciones.find((s) => s.idioma === IDIOMA_POR_DEFECTO) ?? b.secciones[0];
    const eb = estructura(base?.texto ?? '');
    for (const s of b.secciones) {
      if (s === base) continue;
      const e = estructura(s.texto);
      const i = eb.findIndex((x, k) => x !== e[k]);
      if (i >= 0 || e.length !== eb.length) {
        const k = i >= 0 ? i : eb.length;
        out.push(`${donde}la sección «${s.idioma}» no tiene la misma estructura que «${base.idioma}»: {{${e[k] ?? '—'}}} donde debería ir {{${eb[k] ?? '—'}}}`);
      }
    }
  });
  return out;
}
