// Punto de entrada del validador.
//
// Envuelve el `validateText` GENERADO (`validator.ts`) y le añade las
// comprobaciones que el generador no emite (`checks-pendientes.ts`). La
// envoltura vive aquí, fuera de los ficheros generados, para que regenerar con
// `gen-ts.py` no borre nada.

import { parseFields } from './parser';
import { getSystemFields } from '../compose/engine';
import {
  validateText as validateTextGenerado,
  type IncludeResolver,
  type ValidationResult,
} from './validator';
import {
  checkDeclareArraySyntax,
  checkDosPuntosEnPalabraClave,
  checkEndIfNoCanonico,
  checkPageBreakHeredado,
  checkForEachBalance,
  checkIncludeConRuta,
  checkInputConOptions,
  checkReqCatalogo,
  checkReqDocSintaxis,
  checkSetDirectives,
} from './checks-pendientes';
import type { CatalogoReq } from '../ports/catalogo';

/**
 * Valida un texto de plantilla o de párrafo. Mismos diagnósticos por fichero que
 * `validate_template` del Python, salvo los que necesitan la biblioteca de
 * párrafos (E030 INCLUDE sin resolver, E031 ciclos) o varios ficheros
 * (W050/W051), que no se pueden decidir con un texto suelto.
 */
export interface OpcionesValidacion {
  /** Con catálogo, se comprueban los `:REQ`/`:DOC` contra él (W907, W908, W909, W912). */
  catalogo?: CatalogoReq;
}

export function validateText(
  text: string,
  resolver?: IncludeResolver,
  extraDeclared?: Iterable<string>,
  opciones: OpcionesValidacion = {},
): ValidationResult {
  const result = validateTextGenerado(text, resolver, extraDeclared);
  const fields = parseFields(text);
  const clavesDeSistema = new Set(Object.keys(getSystemFields()).map((k) => k.toUpperCase()));

  result.diagnostics.push(
    ...checkSetDirectives(fields, clavesDeSistema),
    ...checkForEachBalance(fields),
    ...checkDeclareArraySyntax(fields),
    ...checkInputConOptions(fields),
    ...checkIncludeConRuta(fields),
    ...checkDosPuntosEnPalabraClave(fields),
    ...checkEndIfNoCanonico(fields),
    ...checkPageBreakHeredado(fields),
    ...checkReqDocSintaxis(fields),
    ...(opciones.catalogo ? checkReqCatalogo(fields, opciones.catalogo) : []),
  );

  // Orden estable por posición y código: el margen del editor lo necesita, y
  // hace que dos ejecuciones sean comparables.
  result.diagnostics.sort(
    (a, b) => a.line - b.line || a.col - b.col || a.code.localeCompare(b.code),
  );
  return result;
}
