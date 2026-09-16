/**
 * Clases canónicas de los controles de página (PLAN_TECNICO_LINEA_PLATA.md /
 * UI_GUIDELINES.md). Todas cuelgan del color de ACCIÓN (`mc-action-*`), que
 * sigue al logo de la app: cian en la Línea Oro, grafito en la Línea Plata.
 *
 * Los matices que un token de color no puede expresar (en plata el enlace va
 * SIEMPRE subrayado y el chip activo es relleno sólido) se resuelven aquí con
 * la variante arbitraria `[[data-brand=silver]_&]:` — así ninguna página
 * necesita saber en qué línea está.
 */

/** Enlace dentro de una tabla o lista (el Nº de expediente, la referencia…). */
export const ACTION_LINK_CLS =
  "font-medium text-mc-action-700 hover:underline " +
  "[[data-brand=silver]_&]:underline [[data-brand=silver]_&]:decoration-mc-action-300 " +
  "[[data-brand=silver]_&]:underline-offset-2 [[data-brand=silver]_&]:text-mc-action-800 " +
  "[[data-brand=silver]_&]:hover:decoration-mc-action-700";

/** Enlace-Nº monoespaciado (variante más común en bandejas). */
export const ACTION_LINK_MONO_CLS = "font-mono " + ACTION_LINK_CLS;

/** Input / select / textarea de formulario (tamaño normal). */
export const INPUT_CLS =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-foreground " +
  "placeholder:text-mc-slate-400 focus:outline-none focus:ring-2 focus:ring-mc-action-ring focus:ring-offset-1 " +
  "disabled:cursor-not-allowed disabled:bg-mc-neutral-100 disabled:opacity-60";

/** Control compacto de barra de filtros (toolbar de DataTable). */
export const INPUT_SM_CLS =
  "h-8 rounded-md border border-input bg-white px-2 py-1 text-xs text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-mc-action-ring focus:ring-offset-1";

/** Label de campo. */
export const LABEL_CLS = "mb-1 block text-sm font-medium text-mc-slate-700";

/** Label de campo compacto (formularios densos, toolbars). */
export const LABEL_SM_CLS = "mb-1 block text-xs font-medium text-mc-slate-700";

/** Checkbox / radio nativos. */
export const CHECKBOX_CLS = "h-4 w-4 rounded border-mc-slate-300 accent-mc-action-600";

/** Cabecera de sección dentro de una tarjeta o pestaña. */
export const SECTION_TITLE_CLS = "text-sm font-semibold text-mc-slate-700";

/** Etiqueta pequeña en mayúsculas (grupos, columnas de kanban). */
export const EYEBROW_CLS = "text-[10px] font-semibold uppercase tracking-wider text-mc-slate-400";

/** Tarjeta / sección de contenido. */
export const CARD_CLS = "rounded-lg border bg-white";

/** Fondo suave de columna/kanban (cálido en oro, frío en plata). */
export const SURFACE_SOFT_CLS = "bg-mc-surface-soft";
