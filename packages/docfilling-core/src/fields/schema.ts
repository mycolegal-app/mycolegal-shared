// Esquema de campos de una plantilla: qué pide, de qué tipo, con qué opciones,
// **quién lo rellena** y a qué dato IUI corresponde.
//
// Port de `field_schema._parse` del SaaS (lo que allí sirve
// `GET /api/v1/templates/{id}/fields`, la tarea A3 de FASE 32). Es la pieza que
// alimenta dos cosas:
//   · `faltantes[]` de la frontera `/api/inter/documentos`, y
//   · el `FaltantesForm` que ve el oficial (tipo, opciones, instrucción).
//
// La app lo cachea en `docfilling_plantillas.esquemaCampos` por `(nombre, huella)`.

import { FieldType, parseFields, type ParsedField } from '../syntax/parser';
import { getSystemFields } from '../compose/engine';
import { tipoCanonico } from '../syntax/declare-types';
import { camposSoloCondicionales, type ContextoCampos } from './conditional-only';
import { instruccionesDeCampo } from './instructions';

/** Quién aporta el valor de un campo. */
export const QUIEN = {
  /** La extrae la IA de los documentos. */
  IA: 'ia',
  /** La aporta una persona (INPUT / INPUT_FINAL). */
  PERSONA: 'persona',
  /** La resuelve el motor y no se pide nunca (sistema, AUTO, COUNT, SET, `@…`). */
  MOTOR: 'solo',
} as const;
export type Quien = (typeof QUIEN)[keyof typeof QUIEN];

export interface Subcampo {
  nombre: string;
  tipo: string;
  instruccion: string | null;
  /** Ruta relativa al elemento del array (`PER/NOM`). `null` si el array no
   *  declara la suya. */
  iuiPath: string | null;
}

export interface Campo {
  nombre: string;
  quien: Quien;
  /** Directiva de origen: DECLARE, DECLARE_ARRAY, EXTRACTED, INPUT… */
  categoria: string;
  /** TEXT | NUM | DATE | BOOL — **siempre canónico**: los sinónimos de la biblioteca
   *  (BOOLEAN, NUMBER, STRING, LIST…) se traducen aquí. */
  tipo: string;
  /** Texto legible para el oficial. Al oficial no se le enseña
   *  `PRECIO_TOTAL_VIVIENDA_M2`. */
  etiqueta: string;
  opciones: string[];
  instruccion: string | null;
  porDefecto: string | null;
  esArray: boolean;
  subcampos: Subcampo[];
  /** No deja la tarea `incomplete` aunque falte: sólo gobierna un IF, o es un
   *  DECLARE auxiliar. Mismo criterio que el procesado. */
  soloCondicional: boolean;
  iuiPath: string | null;
}

export interface EsquemaDePlantilla {
  campos: Campo[];
  /** INCLUDE de primer nivel, ordenados. */
  includes: string[];
  /** `{{HUMAN_ACTION[_FASE]:…}}` por fase: no son campos, son trabajo humano. */
  accionesHumanas: { init: string[]; pre: string[]; post: string[] };
}

export interface OpcionesEsquema extends Partial<ContextoCampos> {
  /** Cómo convertir un nombre de campo en algo legible. Por defecto, una
   *  heurística determinista; el humanizador completo es F1.7. */
  etiquetar?: (nombre: string) => string;
}

/** Heurística determinista: `PRECIO_TOTAL_VIVIENDA` → «Precio total vivienda».
 *  No sustituye al `input_humanizer` del SaaS (que además tiene mapeos y un
 *  camino con LLM); es el suelo razonable hasta F1.7. */
export function etiquetaPorDefecto(nombre: string): string {
  const limpio = nombre.replace(/^@/, '').replace(/_/g, ' ').trim().toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function quienDe(f: ParsedField, nombre: string): Quien | null {
  switch (f.fieldType) {
    case FieldType.EXTRACTED:
    case FieldType.DECLARE:
    case FieldType.DECLARE_ARRAY:
    case FieldType.DOCUBOT:
      // `@autonumber:…` y demás convenciones con arroba las resuelve el motor.
      return nombre.startsWith('@') ? QUIEN.MOTOR : QUIEN.IA;
    case FieldType.INPUT:
    case FieldType.INPUT_FINAL:
      return QUIEN.PERSONA;
    case FieldType.SYSTEM:
    case FieldType.AUTO:
    case FieldType.COUNT:
    case FieldType.SET:
      return QUIEN.MOTOR;
    default:
      return null;
  }
}

export function esquemaDeCampos(
  plantilla: string,
  opciones: OpcionesEsquema = {},
): EsquemaDePlantilla {
  const texto = plantilla.normalize('NFC');
  const ctx: ContextoCampos = {
    camposDeSistema:
      opciones.camposDeSistema ??
      new Set(Object.keys(getSystemFields()).map((k) => k.toUpperCase())),
    camposPredefinidos: opciones.camposPredefinidos ?? new Set<string>(),
  };
  const etiquetar = opciones.etiquetar ?? etiquetaPorDefecto;

  const analizados = parseFields(texto);
  const soloCondicionales = camposSoloCondicionales(texto, ctx);
  const instrucciones = instruccionesDeCampo(texto, ctx);

  const campos: Campo[] = [];
  const vistos = new Set<string>();

  for (const f of analizados) {
    const nombre = f.name || f.content;
    // El parser clasifica `{{HUMAN_ACTION[_FASE]:…}}` como extraído; no es un
    // campo, es trabajo humano y va aparte.
    if (nombre === 'HUMAN_ACTION' || nombre.startsWith('HUMAN_ACTION_')) continue;

    const quien = quienDe(f, nombre);
    if (quien === null || vistos.has(nombre)) continue;
    vistos.add(nombre);

    const esInput = f.fieldType === FieldType.INPUT || f.fieldType === FieldType.INPUT_FINAL;
    campos.push({
      nombre,
      quien,
      categoria: f.fieldType,
      // Siempre canónico: quien consume el esquema no tiene que saber que el
      // biblioteca escribe BOOLEAN o STRING (ver `declare-types.ts`).
      tipo: tipoCanonico(f.declareType),
      etiqueta: quien === QUIEN.MOTOR ? nombre : etiquetar(nombre),
      // Un `DECLARE X:INPUT(desc|a,b)` guarda la lista en `inputOptions`, igual que
      // el INPUT pintado: sin esto, 363 condiciones de la biblioteca llegaban a la
      // pantalla como texto libre y a la IA sin «valores admitidos».
      opciones: esInput || f.inputOptions?.length
        ? [...(f.inputOptions ?? [])]
        : [...(f.extractionOptions ?? [])],
      instruccion: f.declareInstruction || f.inputDescription || instrucciones[nombre] || null,
      porDefecto: f.inputDefault || f.declareValue || null,
      esArray: Boolean(f.isArray),
      subcampos: f.isArray ? subcamposDe(f) : [],
      soloCondicional: soloCondicionales.has(nombre),
      iuiPath: f.iuiPath || null,
    });
  }

  const includes = [
    ...new Set(
      analizados
        .filter((f) => f.fieldType === FieldType.INCLUDE && f.includeTarget)
        .map((f) => f.includeTarget),
    ),
  ].sort();

  return { campos, includes, accionesHumanas: accionesDe(analizados) };
}

function subcamposDe(f: ParsedField): Subcampo[] {
  return (f.arraySubfields ?? []).map((sub) => ({
    nombre: sub.name ?? '',
    tipo: tipoCanonico(sub.type),
    instruccion: sub.instruction || sub.description || null,
    // La ruta por subcampo sale del mapa IUI del array, que es F1.6.
    iuiPath: null,
  }));
}

function accionesDe(analizados: ParsedField[]): EsquemaDePlantilla['accionesHumanas'] {
  const out = { init: [] as string[], pre: [] as string[], post: [] as string[] };
  for (const f of analizados) {
    const nombre = f.name || f.content;
    if (nombre !== 'HUMAN_ACTION' && !nombre.startsWith('HUMAN_ACTION_')) continue;
    const fase = (nombre.split('_')[2] ?? 'pre').toLowerCase();
    const descripcion = f.content.split(':').slice(1).join(':').trim() || f.content;
    if (fase === 'init' || fase === 'pre' || fase === 'post') out[fase].push(descripcion);
    else out.pre.push(descripcion);
  }
  return out;
}
