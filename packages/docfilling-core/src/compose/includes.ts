// Qué párrafos necesita una plantilla.
//
// La app lo cachea en `docfilling_plantillas.includes` por `(nombre, huella)`
// para saber qué firmar y qué prevalidar sin recorrer la plantilla en cada
// generación. La resolución recursiva de verdad —con su límite de profundidad y
// su detección de ciclos— es del filler (F1.4); esto es sólo el primer nivel.

import { parseFields, FieldType } from '../syntax/parser';

/**
 * Nombres de los INCLUDE de PRIMER NIVEL de una plantilla, sin repetidos y en
 * orden de aparición. No resuelve: sólo lee lo que la plantilla declara.
 */
export function includesDe(plantilla: string): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const campo of parseFields(plantilla)) {
    if (campo.fieldType !== FieldType.INCLUDE) continue;
    const nombre = campo.includeTarget || null;
    if (!nombre || vistos.has(nombre)) continue;
    vistos.add(nombre);
    salida.push(nombre);
  }
  return salida;
}
