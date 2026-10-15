// MODO COBERTURA (certificación de los esquemas base, puerta P2; 15-oct-2026).
//
// La pregunta: ¿qué ramas de un esquema han recorrido de verdad sus casos de prueba? Una rama que ningún caso toca
// puede estar rota sin que nadie lo vea (el informe de coherencia del 0507 encontró así un marcador
// «[[PENDIENTE DE DESARROLLO NOTARIAL]]» que se imprimía en la escritura).
//
// NO SE ANOTAN LAS EVALUACIONES. `processConditionals` resuelve los IF de dentro hacia fuera, así que evalúa también
// los que están dentro de una rama que después se descarta: contar sus evaluaciones daría por recorridas ramas que no
// salen en la escritura. En su lugar, antes de componer se pone una marca invisible al principio de cada rama
// (`\x00COV:<id>:T\x00` en la verdadera, `…:F\x00` en la falsa, con un `{{ELSE}}` añadido si no lo había) y, después
// de componer, las marcas que SOBREVIVEN son exactamente las ramas que la escritura recorrió. Es el mismo motor, con
// la misma semántica: nada que mantener en paralelo.
//
// Sin coste si no se usa: nadie llama a esto en una composición normal.
import { INC_BEGIN_MARK, INC_END_MARK, normalizeConditionals, processConditionals, type FieldValues } from './engine';

/** Una rama: el lado verdadero (`T`) o el falso (`F`) de un `{{IF}}`. */
export interface RamaIf {
  /** Número del IF, en orden de aparición en el texto expandido. */
  id: number;
  condicion: string;
  /** El párrafo que lo contiene (el INCLUDE más interior), o `null` si está en el propio esquema. */
  parrafo: string | null;
  /** La rama de la que cuelga este IF, o `null` si está a primer nivel. */
  padre: { id: number; lado: 'T' | 'F' } | null;
  /** Si el original tenía `{{ELSE}}`. Sin él, la rama falsa no escribe nada (sólo se cuenta). */
  conElse: boolean;
  /** Línea del texto expandido (1-based). */
  linea: number;
  /** Su número de orden entre los IF de su párrafo (los del propio párrafo, no los de los que incluye). Un párrafo
   *  incluido varias veces (la comparecencia, una por parte) tiene los mismos IF en cada copia: `parrafo` + `ordinal`
   *  identifica la rama de la PLANTILLA, que es lo que se prueba. */
  ordinal: number;
}

/** Una pregunta con opciones cerradas (`{{DECLARE X:INPUT(¿…?|a,b,c)}}`) y la rama donde está declarada. */
export interface PreguntaConOpciones {
  campo: string;
  opciones: string[];
  parrafo: string | null;
  padre: { id: number; lado: 'T' | 'F' } | null;
  /** Su número de orden entre las preguntas de su párrafo (como `RamaIf.ordinal`). */
  ordinal: number;
}

export interface TextoMarcado {
  /** El texto con las marcas de cobertura, listo para componer. Sin las marcas de nombre de párrafo. */
  texto: string;
  ramas: RamaIf[];
  preguntas: PreguntaConOpciones[];
}

const MARCA = (id: number, lado: 'T' | 'F') => `\x00COV:${id}:${lado}\x00`;
const RE_MARCA = /\x00COV:(\d+):([TF])\x00/g;
const RE_TOKEN = /\{\{IF\s+([^}]+)\}\}|\{\{ELSE\}\}|\{\{ENDIF\}\}|\x00INC_BEGIN\x00(?:\x00PARR:([^\x00]*)\x00)?|\x00INC_END\x00|\x00PARR:[^\x00]*\x00|\{\{\s*DECLARE\s+([A-Za-z_][\wÀ-ɏ.]*)([^}]*)\}\}/g;

/** Las opciones de un `:INPUT(etiqueta|a,b,"c, d")`, respetando comillas. */
function opcionesDeInput(resto: string): string[] {
  const m = resto.match(/:INPUT\(([^|)]*)\|((?:"[^"]*"|[^)])*)\)/);
  if (!m) return [];
  const out: string[] = [];
  let buf = '';
  let q = false;
  for (const c of m[2]) {
    if (c === '"') { q = !q; continue; }
    if (c === ',' && !q) { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  out.push(buf.trim());
  return out.filter(Boolean);
}

/**
 * Marca cada rama del texto expandido (con los INCLUDE ya sustituidos; mejor con `nombrarParrafos`, para saber de qué
 * párrafo es cada rama). Devuelve el texto marcado, las ramas y las preguntas con opciones cerradas.
 */
export function marcarRamas(expandido: string): TextoMarcado {
  const texto = normalizeConditionals(expandido);
  const ramas: RamaIf[] = [];
  const preguntas: PreguntaConOpciones[] = [];
  const pilaIf: { id: number; lado: 'T' | 'F' }[] = [];
  const pilaParrafo: { nombre: string | null; ifs: number; preguntas: number }[] = [{ nombre: null, ifs: 0, preguntas: 0 }];
  const marco = () => pilaParrafo[pilaParrafo.length - 1];
  const parrafoActual = () => marco().nombre;
  const padreActual = () => (pilaIf.length ? { ...pilaIf[pilaIf.length - 1] } : null);
  let salida = '';
  let desde = 0;
  let linea = 1;
  let lineaHasta = 0;
  for (const m of texto.matchAll(RE_TOKEN)) {
    const i = m.index!;
    salida += texto.slice(desde, i);
    desde = i + m[0].length;
    for (let k = lineaHasta; k < i; k++) if (texto.charCodeAt(k) === 10) linea++;
    lineaHasta = i;
    const t = m[0];
    if (m[1] !== undefined) {
      const id = ramas.length;
      ramas.push({ id, condicion: m[1].trim(), parrafo: parrafoActual(), padre: padreActual(), conElse: false, linea, ordinal: marco().ifs++ });
      pilaIf.push({ id, lado: 'T' });
      salida += t + MARCA(id, 'T');
    } else if (t === '{{ELSE}}') {
      const tope = pilaIf[pilaIf.length - 1];
      if (tope) { tope.lado = 'F'; ramas[tope.id].conElse = true; salida += t + MARCA(tope.id, 'F'); } else salida += t;
    } else if (t === '{{ENDIF}}') {
      const tope = pilaIf.pop();
      if (tope && !ramas[tope.id].conElse) salida += `{{ELSE}}${MARCA(tope.id, 'F')}`;
      salida += t;
    } else if (t.startsWith(INC_BEGIN_MARK)) {
      pilaParrafo.push({ nombre: m[2] ?? null, ifs: 0, preguntas: 0 });
      salida += INC_BEGIN_MARK; // sin la marca del nombre: el motor no la conoce
    } else if (t === INC_END_MARK) {
      if (pilaParrafo.length > 1) pilaParrafo.pop();
      salida += t;
    } else if (t.startsWith('\x00PARR:')) {
      // una marca de nombre suelta: se quita
    } else {
      const opciones = opcionesDeInput(m[4] ?? '');
      if (opciones.length) preguntas.push({ campo: m[3].toUpperCase(), opciones, parrafo: parrafoActual(), padre: padreActual(), ordinal: marco().preguntas++ });
      salida += t;
    }
  }
  salida += texto.slice(desde);
  return { texto: salida, ramas, preguntas };
}

/** Las ramas que sobrevivieron en el texto ya compuesto: `"<id>:T"` / `"<id>:F"`. */
export function ramasRecorridas(compuesto: string): Set<string> {
  const s = new Set<string>();
  for (const m of compuesto.matchAll(RE_MARCA)) s.add(`${m[1]}:${m[2]}`);
  return s;
}

/** El texto compuesto sin las marcas de cobertura. */
export function sinMarcasDeCobertura(compuesto: string): string {
  return compuesto.replace(RE_MARCA, '');
}

// ── Alcanzable desde el esquema ──────────────────────────────────────────────────────────────────────────────────
//
// Una rama es INALCANZABLE si las constantes del esquema (`{{DECLARE X = v}}`: `TIPO_ACTO`, `ACTO_JURIDICO`…) la
// descartan con certeza: la rama de la donación dentro de un párrafo compartido, en la extinción de condominio. El
// resto se da por alcanzable. Cada átomo sobre una constante lo evalúa el propio motor; un átomo sobre otro campo es
// «no se sabe». Lógica de tres valores: verdadero, falso, no se sabe.

type Tri = boolean | null;

function partir(expr: string, sep: string): string[] {
  const out: string[] = [];
  let buf = '';
  let q: string | null = null;
  let par = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (q) { buf += c; if (c === q || (q === '“' && c === '”') || (q === '«' && c === '»')) q = null; continue; }
    if (c === '"' || c === "'" || c === '“' || c === '«') { q = c; buf += c; continue; }
    if (c === '(') par++;
    if (c === ')' && par > 0) par--;
    if (par === 0 && /\s/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /\s/.test(expr[j])) j++;
      const k = j + sep.length;
      if (expr.slice(j, k).toUpperCase() === sep && (k >= expr.length || /\s/.test(expr[k]))) { out.push(buf.trim()); buf = ''; i = k - 1; continue; }
    }
    buf += c;
  }
  out.push(buf.trim());
  return out;
}

function envuelta(e: string): boolean {
  if (!e.startsWith('(') || !e.endsWith(')')) return false;
  let d = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === '(') d++;
    else if (e[i] === ')') { d--; if (d === 0 && i < e.length - 1) return false; }
  }
  return d === 0;
}

function evaluarTri(expr: string, constantes: FieldValues, nombres: Set<string>): Tri {
  const e = expr.trim();
  if (!e) return false;
  const o = partir(e, 'OR');
  if (o.length > 1) {
    const r = o.map((p) => evaluarTri(p, constantes, nombres));
    return r.includes(true) ? true : r.every((x) => x === false) ? false : null;
  }
  const a = partir(e, 'AND');
  if (a.length > 1) {
    const r = a.map((p) => evaluarTri(p, constantes, nombres));
    return r.includes(false) ? false : r.every((x) => x === true) ? true : null;
  }
  if (/^NOT[\s(]/i.test(e)) { const r = evaluarTri(e.slice(3), constantes, nombres); return r === null ? null : !r; }
  if (envuelta(e)) return evaluarTri(e.slice(1, -1), constantes, nombres);
  const campo = e.replace(/^COUNT\s*\(\s*/i, '').match(/^(?:SYSTEM:)?([A-Za-z_][\wÀ-ɏ.]*)/)?.[1]?.toUpperCase();
  if (!campo || !nombres.has(campo)) return null;
  return processConditionals(`{{IF ${e}}}1{{ELSE}}0{{ENDIF}}`, constantes) === '1';
}

/**
 * Las ramas que se pueden recorrer desde el esquema, dadas sus constantes: `"<id>:T"` / `"<id>:F"`. Una rama lo es si
 * lo es la rama de la que cuelga y su condición no queda descartada por las constantes.
 */
export function ramasAlcanzables(ramas: RamaIf[], constantes: FieldValues): Set<string> {
  const nombres = new Set(Object.keys(constantes).map((k) => k.toUpperCase()));
  const mayus: FieldValues = Object.fromEntries(Object.entries(constantes).map(([k, v]) => [k.toUpperCase(), v]));
  const alc = new Set<string>();
  for (const r of ramas) { // en orden: el padre siempre va antes
    if (r.padre && !alc.has(`${r.padre.id}:${r.padre.lado}`)) continue;
    const v = evaluarTri(r.condicion, mayus, nombres);
    if (v !== false) alc.add(`${r.id}:T`);
    if (v !== true) alc.add(`${r.id}:F`);
  }
  return alc;
}
