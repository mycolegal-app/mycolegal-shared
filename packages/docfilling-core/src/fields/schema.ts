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
import { listasDeLaPlantilla } from './listas';
import type { ReqDecl } from '../syntax/req-doc';

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
  /** `:REQ(…)` del subcampo. El rol, si el subcampo no lo trae, lo hereda de la lista. */
  req: ReqDecl[];
  /** `:DOC(…)` del subcampo. */
  doc: string[];
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
  /** `:REQ(…)`: a qué hechos o datos del catálogo universal equivale (ver `req.ts`). */
  req: ReqDecl[];
  /** `:DOC(…)`: de qué tipos de documento del catálogo sale la respuesta. */
  doc: string[];
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

  // `:REQ` / `:DOC` por nombre, de la PRIMERA declaración que los trae. El campo se
  // construye con su primera aparición, que puede ser un uso pintado anterior al
  // DECLARE: sin esto el enlace se perdería. Las declaraciones divergentes las caza
  // `analizarBiblioteca` (F2.4 del plan).
  const reqDocDe = new Map<string, { req: ReqDecl[]; doc: string[] }>();
  for (const f of analizados) {
    if (!f.name || (!f.req?.length && !f.doc?.length)) continue;
    if (!reqDocDe.has(f.name)) reqDocDe.set(f.name, { req: f.req, doc: f.doc });
  }

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
      req: [...(reqDocDe.get(nombre)?.req ?? [])],
      doc: [...(reqDocDe.get(nombre)?.doc ?? [])],
    });
  }

  // Listas: las que recorre un FOR EACH, con los subcampos que usan sus bucles
  // y sus párrafos vinculados (ver `listas.ts`). Lo que sólo es dato de un
  // elemento deja de pedirse como campo suelto.
  const { listas, soloDeElemento } = listasDeLaPlantilla(texto);
  for (let i = campos.length - 1; i >= 0; i--) {
    if (soloDeElemento.has(campos[i].nombre.toUpperCase())) campos.splice(i, 1);
  }
  for (const l of listas.values()) {
    if (l.nombre.includes('.')) continue; // anidada: va como subcampo LIST del padre
    let c = campos.find((x) => x.nombre.toUpperCase() === l.nombre);
    if (!c) {
      c = {
        nombre: l.nombre, quien: QUIEN.IA, categoria: FieldType.DECLARE_ARRAY, tipo: 'TEXT',
        etiqueta: etiquetar(l.nombre), opciones: [], instruccion: instrucciones[l.nombre] || null,
        porDefecto: null, esArray: true, subcampos: [], soloCondicional: false, iuiPath: null,
        req: [], doc: [],
      };
      campos.push(c);
    }
    c.esArray = true;
    c.soloCondicional = false;
    const ya = new Set(c.subcampos.map((s) => s.nombre.toUpperCase()));
    for (const [nombre, tipo] of l.subcampos) {
      if (ya.has(nombre)) continue;
      const anidada = listas.get(`${l.nombre}.${nombre}`);
      c.subcampos.push({
        nombre, tipo,
        instruccion: anidada && anidada.subcampos.size ? `Lista de: ${[...anidada.subcampos.keys()].join(', ')}` : null,
        iuiPath: null,
        req: [], doc: [],
      });
    }
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
  // `:REQ(@ROL)` sin hecho sobre la lista: el papel de todos sus subcampos.
  const rolDeLista = f.req?.find((r) => r.ref === null && r.rol)?.rol ?? null;
  return (f.arraySubfields ?? []).map((sub) => {
    const nombre = sub.name ?? '';
    const propio = f.arraySubfieldsReqDoc?.[nombre.toUpperCase()];
    return {
      nombre,
      tipo: tipoCanonico(sub.type),
      instruccion: sub.instruction || sub.description || null,
      // La ruta por subcampo sale del mapa IUI del array, que es F1.6.
      iuiPath: null,
      req: (propio?.req ?? []).map((r) => (r.rol || !rolDeLista ? r : { ...r, rol: rolDeLista })),
      doc: [...(propio?.doc ?? [])],
    };
  });
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
