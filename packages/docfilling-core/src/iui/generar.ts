// IUI/CTN: construcción del XML del Índice Único Informatizado a partir de rutas y valores.
//
// ⚠️ EN TRANSICIÓN (plan REQ_CATALOGO_IUI, 9-oct-2026).
//
// Los mapeos ya NO salen de la plantilla: `:IUI(…)` y `{{MAP_IUI:…}}` están retirados (W913),
// y con ellos `mapaIui`/`mapaIuiDetallado`. El IUI vive ahora en el catálogo universal (cada
// hecho o dato lleva su ruta y sus códigos) y el campo enlaza con él por `:REQ`. Cuando se
// retiraron, ningún esquema ni párrafo de `_PROD` los usaba.
//
// Lo que queda aquí es el CONSTRUCTOR: dado `campo → ruta` y los valores, arma el árbol y lo
// serializa, sin dependencias. F5 del plan lo sustituye por un modelo (sujetos con `ID_SUJ`,
// objetos con `ID_OBJ` y una operación cuyas clases los citan, en el orden del XSD), porque en
// el XML la operación no contiene a los sujetos: los cita.
//
// Sin librería XML a propósito: el documento es un árbol de elementos con texto en las hojas,
// y este paquete no tiene ninguna dependencia de ejecución. La validación contra el XSD es de
// la frontera y de los tests (los XSD están en el catálogo, `content/req-docs/iui/xsd`).


/** El espacio de nombres del esquema INTI IU2007. */
export const IUI_NAMESPACE = 'http://inti.notariado.org/XML/IU2007';

/** Mapeo de un `DECLARE ARRAY`: la ruta del elemento repetido y sus subcampos. */
export interface MapeoArray {
  /** Ruta del elemento que se repite, p. ej. `DOCS_NOT/DOC_NOT/SUJS/SUJ`. */
  path: string;
  /** Subcampo → ruta relativa al elemento. Sin entrada, cuelga por su nombre. */
  subcampos?: Record<string, string>;
}

/** Campo → ruta CTN, o mapeo de array. */
export type MapeosIui = Record<string, string | MapeoArray>;

/** Valor de un campo: texto suelto, la forma `{value}` de la extracción, o la
 *  lista de elementos de un array. */
export type ValorCampo = unknown;

export interface OpcionesIui {
  /** Metadatos `GEN_DAT`. Por defecto, los de DocFilling. */
  generador?: { producto: string; aplicacion: string; version: string };
  /** Indentación. `null` para una sola línea. */
  indentar?: string | null;
}

const SEGMENTO_INDEXADO = /^([A-Z_]+)\[(\d+)\]$/;

// ─────────────────────────────── el árbol ───────────────────────────────

interface Nodo {
  tag: string;
  hijos: Nodo[];
  texto?: string;
}

const nodo = (tag: string): Nodo => ({ tag, hijos: [] });

/** Primer hijo con esa etiqueta, o lo crea. */
function hijoOCrear(padre: Nodo, tag: string): Nodo {
  const existe = padre.hijos.find((h) => h.tag === tag);
  if (existe) return existe;
  const n = nodo(tag);
  padre.hijos.push(n);
  return n;
}

/** Hijo `tag[indice]` (1-based), creando los intermedios que falten. Es lo que
 *  hace que `SUJ[3]` funcione aunque nadie haya escrito `SUJ[1]` ni `SUJ[2]`. */
function hijoIndexadoOCrear(padre: Nodo, tag: string, indice: number | null): Nodo {
  if (indice === null) return hijoOCrear(padre, tag);
  const mismos = padre.hijos.filter((h) => h.tag === tag);
  for (let i = mismos.length; i < indice; i++) {
    const n = nodo(tag);
    padre.hijos.push(n);
    mismos.push(n);
  }
  return mismos[indice - 1];
}

function partirSegmento(seg: string): [string, number | null] {
  const m = seg.match(SEGMENTO_INDEXADO);
  return m ? [m[1], Number(m[2])] : [seg, null];
}

/** Escribe `valor` en la ruta, creando lo que falte. La raíz `DOCS_NOT` se
 *  salta: ya es la raíz del documento. */
function ponerEnRuta(raiz: Nodo, ruta: string, valor: string): void {
  let segs = ruta.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segs[0] === 'DOCS_NOT') segs = segs.slice(1);
  if (segs.length === 0) return;
  let actual = raiz;
  for (let i = 0; i < segs.length; i++) {
    const [tag, idx] = partirSegmento(segs[i]);
    const n = hijoIndexadoOCrear(actual, tag, idx);
    if (i === segs.length - 1) n.texto = valor;
    else actual = n;
  }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializar(n: Nodo, indentar: string | null, nivel = 0, raiz = false): string {
  const pad = indentar === null ? '' : indentar.repeat(nivel);
  const nl = indentar === null ? '' : '\n';
  const ns = raiz ? ` xmlns="${IUI_NAMESPACE}"` : '';
  if (n.hijos.length === 0) {
    const t = n.texto === undefined ? '' : escapar(n.texto);
    return t === ''
      ? `${pad}<${n.tag}${ns}/>${nl}`
      : `${pad}<${n.tag}${ns}>${t}</${n.tag}>${nl}`;
  }
  const dentro = n.hijos.map((h) => serializar(h, indentar, nivel + 1)).join('');
  return `${pad}<${n.tag}${ns}>${nl}${dentro}${pad}</${n.tag}>${nl}`;
}

// ───────────────────────────── los valores ─────────────────────────────

/** Texto de una hoja, o `null` si no hay dato que escribir. El motor emite
 *  `[NO DISPONIBLE]` donde falta un valor, y eso NO debe acabar en el XML. */
export function valorUtil(v: unknown): string | null {
  let x = v;
  if (x !== null && typeof x === 'object' && !Array.isArray(x) && 'value' in (x as object)) {
    x = (x as { value: unknown }).value;
  }
  if (x === null || x === undefined || typeof x === 'object') return null;
  const t = String(x).trim();
  if (!t) return null;
  const u = t.toUpperCase();
  return u === 'NO DISPONIBLE' || u === '[NO DISPONIBLE]' ? null : t;
}

/** Los elementos de un array: la lista, `{value: [...]}`, o un JSON con ella. */
function elementosDeArray(v: unknown): unknown[] | null {
  let x = v;
  if (x !== null && typeof x === 'object' && !Array.isArray(x) && 'value' in (x as object)) {
    x = (x as { value: unknown }).value;
  }
  if (typeof x === 'string') {
    try { x = JSON.parse(x); } catch { return null; }
  }
  return Array.isArray(x) ? x : null;
}

/** Expande un mapeo de array en pares `(ruta indexada, valor)`. */
function expandirArray(mapeo: MapeoArray, valor: unknown): Array<[string, string]> {
  const elementos = elementosDeArray(valor);
  const base = (mapeo.path || '').replace(/^\/+|\/+$/g, '').replace(/\[\d+\]$/, '');
  if (!elementos || !base) return [];
  const subs = new Map<string, string>();
  for (const [k, v] of Object.entries(mapeo.subcampos ?? {})) {
    subs.set(k.toUpperCase(), String(v).replace(/^\/+|\/+$/g, ''));
  }
  const pares: Array<[string, string]> = [];
  elementos.forEach((el, i) => {
    const rutaEl = `${base}[${i + 1}]`;
    if (el !== null && typeof el === 'object' && !Array.isArray(el) && !('value' in (el as object))) {
      for (const [clave, bruto] of Object.entries(el as Record<string, unknown>)) {
        const v = valorUtil(bruto);
        if (v === null) continue;
        const rel = subs.get(clave.toUpperCase()) || clave.toUpperCase();
        pares.push([`${rutaEl}/${rel}`, v]);
      }
    } else {
      const v = valorUtil(el);
      if (v !== null) pares.push([rutaEl, v]);
    }
  });
  return pares;
}

// ────────────────────────────── la superficie ──────────────────────────

/**
 * Construye el XML IUI a partir de los mapeos y los valores.
 *
 * Devuelve `null` si no hay ningún valor que escribir — no un documento vacío:
 * un XML con sólo `GEN_DAT` no vale para nada y confundiría a quien lo reciba.
 */
export function generarIui(
  mapeos: MapeosIui,
  valores: Record<string, ValorCampo>,
  opciones: OpcionesIui = {},
): string | null {
  if (!mapeos || Object.keys(mapeos).length === 0) return null;
  const indentar = opciones.indentar === undefined ? '  ' : opciones.indentar;
  const gen = opciones.generador ?? {
    producto: 'DocFilling', aplicacion: 'DocFilling AI', version: '1.0',
  };

  const escalares: Array<[string, string]> = [];
  const deArrays: Array<[string, string]> = [];
  for (const [campo, mapeo] of Object.entries(mapeos)) {
    if (typeof mapeo === 'string') {
      const v = valorUtil(valores[campo]);
      if (v !== null) escalares.push([mapeo, v]);
    } else {
      deArrays.push(...expandirArray(mapeo, valores[campo]));
    }
  }
  if (escalares.length === 0 && deArrays.length === 0) return null;

  const raiz = nodo('DOCS_NOT');
  const genDat = hijoOCrear(raiz, 'GEN_DAT');
  hijoOCrear(genDat, 'NOM_PRO').texto = gen.producto;
  hijoOCrear(genDat, 'NOM_APL').texto = gen.aplicacion;
  hijoOCrear(genDat, 'VER_APL').texto = gen.version;

  for (const [ruta, v] of [...escalares, ...deArrays]) ponerEnRuta(raiz, ruta, v);

  const nl = indentar === null ? '' : '\n';
  return `<?xml version="1.0" encoding="UTF-8"?>${nl}` + serializar(raiz, indentar, 0, true);
}
