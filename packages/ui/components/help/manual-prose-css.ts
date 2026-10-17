/**
 * Estilos de listas para el contenido de los manuales (`.manual-prose`), en
 * pantalla (`ManualLayout`) y en la vista de impresión (`ManualPrintView`).
 *
 * El preflight de Tailwind deja `ul, ol { list-style: none; padding: 0 }`, así
 * que una lista del manual sin `list-disc pl-5` sale sin viñetas ni sangría.
 * Además, en las apps cuyo `tailwind.config` no escanea `src/content/**`, las
 * clases que solo aparecen en el contenido del manual (`ml-5`, `list-inside`…)
 * no se generan y las viñetas «de fuera» caen fuera de la caja (en el PDF, se
 * pierden). Aquí se da a toda lista del manual su marcador y una sangría por
 * defecto, sin tocar cada fichero de contenido por idioma.
 *
 * Especificidad (0,0,1), igual que el preflight: gana por ir después en la
 * cascada, y cualquier utilidad explícita (`list-none`, `pl-0`, `list-decimal`…)
 * sigue mandando. Las listas cuyos `li` son flex/grid (filas con icono) no se
 * tocan: un `li` flex no pinta marcador y no queremos sangrarlas.
 */
export const MANUAL_PROSE_CSS = `
:where(.manual-prose) ul:where(:not(:has(> li.flex, > li.grid, > li.inline-flex))) {
  list-style-type: disc; padding-left: 1.25rem;
}
:where(.manual-prose) ol:where(:not(:has(> li.flex, > li.grid, > li.inline-flex))) {
  list-style-type: decimal; padding-left: 1.25rem;
}
:where(.manual-prose) :is(ul, ol) ul { list-style-type: circle; }
:where(.manual-prose) li::marker { color: #6b7280; }
`;
