// Inferencia determinista de tipo a partir del NOMBRE del campo (F1.7).
//
// QUÉ SE PORTA DEL `input_humanizer` DEL SAAS, Y QUÉ NO
//
// `app/features/operator/input_humanizer.py` (487 líneas) tiene tres piezas:
//
//   1. `FIELD_PATTERNS` — 6 expresiones que deducen el tipo y una pista a
//      partir del nombre. **Esto es lo que se porta**: es independiente del
//      idioma y sirve para elegir el widget del formulario.
//   2. `FIELD_MAPPINGS` — 41 preguntas en castellano, escritas a mano
//      (`FECHA_ESCRITURA` → «¿En qué fecha se firmará la escritura?»).
//      **Esto NO se porta aquí**, ver abajo.
//   3. `humanize_with_llm` — el camino con LLM. Fuera de F1.7 por definición.
//
// POR QUÉ LAS 41 PREGUNTAS NO ENTRAN EN EL MOTOR
//
// Son **texto de producto en un solo idioma**, y este paquete lo consumen el
// módulo de MycoLegal (i18n en 4 idiomas, con la regla de la flota de no
// escribir cadenas a pelo) y el SaaS. Meter castellano dentro del motor obliga
// a los dos a hablar castellano. Su sitio es el catálogo i18n de la app,
// indexado por nombre de campo; el motor aporta lo que no depende del idioma:
// el tipo, la pista estructural y la etiqueta derivada del nombre
// (`etiquetaPorDefecto`, en `schema.ts`).
//
// Y hay un camino mejor que la tabla, que ya existe en el lenguaje: el autor
// escribe la pregunta en la plantilla con `:INPUT(pregunta|opciones)`. La
// inferencia es sólo el suelo para cuando no la ha escrito.

import type { TipoCanonico } from '../syntax/declare-types';

/** Qué se deduce de un nombre de campo. */
export interface TipoInferido {
  tipo: TipoCanonico;
  /** Pista estructural, NO texto de interfaz: «fecha», «dni», «euros»… La app
   *  la traduce; el motor sólo dice de qué clase de dato se trata. */
  clase: string;
}

// Orden significativo: gana la primera que coincide, como en el Python.
const PATRONES: ReadonlyArray<readonly [RegExp, TipoCanonico, string]> = [
  [/^FECHA_?/i, 'DATE', 'fecha'],
  [/^(DNI|NIE|NIF|CIF)_?/i, 'TEXT', 'documento_identidad'],
  [/^(PRECIO|IMPORTE|CANTIDAD|MONTO)_?/i, 'NUM', 'euros'],
  [/^SUPERFICIE_?/i, 'NUM', 'metros_cuadrados'],
  [/^NOMBRE_?/i, 'TEXT', 'nombre'],
  [/^(DOMICILIO|DIRECCION)_?/i, 'TEXT', 'direccion'],
];

/**
 * Deduce tipo y clase del nombre de un campo, o `null` si el nombre no dice
 * nada. **Nunca contradice un tipo declarado**: quien llama debe preferir el
 * `AS <TIPO>` del `DECLARE` y usar esto sólo cuando no hay.
 */
export function inferirTipoDeNombre(nombre: string): TipoInferido | null {
  const n = nombre.replace(/^@/, '');
  for (const [re, tipo, clase] of PATRONES) {
    if (re.test(n)) return { tipo, clase };
  }
  return null;
}
