// IUI/CTN: de los mapeos de la plantilla al XML del Índice Único Informatizado.
//
// Port de `app/core/xml/iui_generator.py` (385 líneas) — F1.6.
//
// DE DÓNDE SALEN LOS MAPEOS
//
// La plantilla dice a qué ruta del esquema CTN va cada campo, de dos maneras:
//
//   {{MAP_IUI:NOMBRE_COMPRADOR:DOCS_NOT/DOC_NOT/SUJS/SUJ[1]/NOM}}
//   {{DECLARE DNI_V AS TEXT:IUI(DOCS_NOT/DOC_NOT/SUJS/SUJ[2]/DNI)}}
//
// La segunda es la buena —el mapeo viaja con la declaración del campo— y es la
// que §4.3 del plan da por construida. `MAP_IUI` es la forma antigua y se sigue
// admitiendo.
//
// SIN LIBRERÍA XML, Y A PROPÓSITO
//
// El Python usa `lxml`. Aquí no hace falta: el documento es un árbol de
// elementos con etiqueta, hijos ordenados y texto en las hojas —ni atributos,
// ni mixed content, ni CDATA—, así que se construye y se serializa a mano. Este
// paquete no tiene NINGUNA dependencia de ejecución y conviene que siga así:
// lo van a consumir el módulo de MycoLegal, el editor y el SaaS.
//
// LO QUE NO SE PORTA: LA VALIDACIÓN CONTRA EL XSD
//
// `_validate_xml` y `_load_xsd_schema` usan `etree.XMLSchema` de `lxml`, y en
// TypeScript no hay validador de XSD sin arrastrar una dependencia pesada.
// Además los XSD del CTN no viven aquí, sino con el conector (§4.3 y
// `reference_iui_ctn_docs`). La validación es trabajo de la frontera, que es
// quien tiene los esquemas; el motor construye el XML y nada más. En el Python
// tampoco era una puerta: registraba avisos y seguía.
//
// LOS ARRAYS, Y QUÉ ES LO QUE SIGUE ABIERTO (A5)
//
// Un `DECLARE ARRAY` con `:IUI(...)` mapea a la ruta del elemento REPETIDO, y
// cada subcampo cuelga de él por su propio `:IUI(...)` o, si no lo lleva, por su
// nombre. `ParsedField.arraySubfields` ya trae la ruta de cada subcampo, así que
// esto se porta completo. (Ojo: el `Subcampo` de `esquemaDeCampos` **no** la
// lleva — es otra estructura, para el formulario.)
//
// Un array **sin** `:IUI` en el array, aunque sus subcampos lo tengan, NO
// produce mapeo: sin la ruta del elemento repetido no hay dónde colgarlos. Es
// lo que hace el Python, y tiene su caso de prueba.
//
// Lo que sigue abierto (**A5**) no es la sintaxis, que funciona en los dos
// motores, sino la CONVENCIÓN: qué rutas CTN usar para los subcampos y para los
// nombres de variables de la póliza entera. Eso se decide con Micó, Doku y
// Javier, no aquí.

// ⚠️ DOS COSAS MEDIDAS SOBRE EL BIBLIOTECA REAL EL 3-OCT-2026, Y LAS DOS IMPORTAN
//
// 1. **Nadie usa esto todavía.** De los 105 esquemas maestros y los 1.696
//    párrafos de `_PROD`, **ninguno** lleva `MAP_IUI` ni `:IUI(`. El único
//    fichero real con mapeos es `IUI_0501_COMPRAVENTA_MAP.md`, y está en
//    `_PROD_old` —retirado—; el resto de coincidencias son manuales. Así que
//    este módulo está portado y probado, pero **sin datos que lo ejerciten**:
//    los mapeos hay que escribirlos, y es parte de lo que A5 tiene que decidir.
//
// 2. **Las dos formas normalizan distinto, y es un defecto del lenguaje.**
//    `:IUI(Operacion.Compraventa.PrecioTotal)` se normaliza a
//    `Operacion/Compraventa/PrecioTotal`, pero `{{MAP_IUI:P:Operacion.Compraventa.PrecioTotal}}`
//    se deja tal cual. La misma ruta escrita de las dos maneras produce dos
//    árboles distintos. Se mantiene la conducta del Python —no se arregla a
//    ciegas— porque el único fichero que lo usaba escribe rutas con puntos y en
//    un vocabulario que NO es IU2007 (`Operacion.*` en vez de `DOCS_NOT/...`):
//    cuál es la convención buena es justo la decisión A5.

import { parseFields, FieldType } from '../syntax/parser';

/** El espacio de nombres del esquema INTI IU2007. */
export const IUI_NAMESPACE = 'http://inti.notariado.org/XML/IU2007';

/** Mapeo de un `DECLARE ARRAY`: la ruta del elemento repetido y sus subcampos. */
export interface MapeoArray {
  /** Ruta del elemento que se repite, p. ej. `DOCS_NOT/DOC_NOT/SUJS/SUJ`. */
  path: string;
  /** Subcampo → ruta relativa al elemento. Sin entrada, cuelga por su nombre. */
  subcampos?: Record<string, string>;
}

/** Un campo mapeado dos veces con rutas distintas. */
export interface ConflictoIui {
  campo: string;
  porMapIui: string | MapeoArray;
  porDeclare: string | MapeoArray;
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
const MAP_IUI_DIRECTIVA = /^MAP_IUI:\s*([^:]+?)\s*:\s*(.+)$/i;

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
 * Los mapeos IUI que declara una plantilla, por las dos formas del lenguaje.
 *
 * Gana el `:IUI(...)` del `DECLARE` sobre un `MAP_IUI` del mismo campo: el
 * mapeo que viaja con la declaración es el que mantiene quien edita el campo.
 */
export function mapaIui(texto: string): MapeosIui {
  return mapaIuiDetallado(texto).mapeos;
}

/**
 * Igual que `mapaIui`, y además los conflictos.
 *
 * El Python los manda al log. Aquí se DEVUELVEN: una librería no decide por su
 * consumidor dónde se avisa, y quien llama puede convertirlos en diagnóstico
 * del editor o en una incidencia.
 */
export function mapaIuiDetallado(texto: string): { mapeos: MapeosIui; conflictos: ConflictoIui[] } {
  const mapeos: MapeosIui = {};
  const conflictos: ConflictoIui[] = [];

  for (const f of parseFields(texto)) {
    if (f.fieldType !== FieldType.MAP_IUI) continue;
    // El parser deja la ruta sin extraer: viene dentro del contenido.
    const m = f.content.match(MAP_IUI_DIRECTIVA);
    if (m) mapeos[m[1].trim()] = m[2].trim();
  }

  for (const f of parseFields(texto)) {
    if (f.fieldType !== FieldType.DECLARE && f.fieldType !== FieldType.DECLARE_ARRAY) continue;
    // Sin ruta en el propio DECLARE no hay mapeo, ni aunque la lleven los
    // subcampos: falta el elemento repetido del que colgarlos.
    if (!f.iuiPath || !f.name) continue;

    let mapeo: string | MapeoArray;
    if (f.fieldType === FieldType.DECLARE_ARRAY) {
      const subcampos: Record<string, string> = {};
      for (const sf of f.arraySubfields) {
        const nombre = sf.name;
        if (!nombre) continue;
        subcampos[nombre] = sf.iuiPath || nombre;
      }
      mapeo = { path: f.iuiPath, subcampos };
    } else {
      mapeo = f.iuiPath;
    }

    const previo = mapeos[f.name];
    // Mismo campo por las dos vías: gana el DECLARE —el mapeo que viaja con la
    // declaración es el que mantiene quien edita el campo—, pero se avisa. Dos
    // rutas iguales salvo las barras de los extremos NO son un conflicto.
    const mismaRuta =
      typeof previo === 'string' && typeof mapeo === 'string' &&
      previo.replace(/^\/+|\/+$/g, '') === mapeo.replace(/^\/+|\/+$/g, '');
    if (previo !== undefined && !mismaRuta) {
      conflictos.push({ campo: f.name, porMapIui: previo, porDeclare: mapeo });
    }
    mapeos[f.name] = mapeo;
  }

  return { mapeos, conflictos };
}

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
