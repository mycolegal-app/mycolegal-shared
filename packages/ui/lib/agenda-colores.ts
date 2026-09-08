import { z } from 'zod';

/**
 * #670 — Colores de la agenda POR TIPO DE CITA, elegibles por la notaría.
 *
 * Hasta ahora el color decía de DÓNDE venía la cita (expediente, protocolo, otra
 * app, manual). La notaría no mira la agenda con esa pregunta: mira "qué tengo
 * hoy", y lo que quiere distinguir de un vistazo es una firma de una reunión, de
 * una consulta o de una hora apartada. Así que el color pasa a decir QUÉ es.
 *
 * Los valores por defecto son los que pidió la notaría:
 *   firma naranja, reunión rojo, consulta azul, otros gris, bloqueo verde.
 *
 * DOS COSAS QUE NO SON CONFIGURABLES, a propósito:
 *
 *  - `ocupado`: una cita privada de otro usuario. Va siempre en gris neutro y no
 *    se puede tocar. Es el color de "aquí no puedes mirar", y dejar que se
 *    pintara como una firma o una reunión ya diría algo de ella (#372).
 *  - La lista de categorías. Se pueden cambiar los colores, no inventar tipos:
 *    el tipo de cita es un enum del modelo, no una etiqueta libre.
 */

export const CATEGORIAS_COLOR = [
  'firma',
  'reunion',
  'consulta',
  'otros',
  'bloqueo',
] as const;

export type CategoriaColor = (typeof CATEGORIAS_COLOR)[number];

export const COLORES_AGENDA_DEFECTO: Record<CategoriaColor, string> = {
  firma: '#ea580c', // naranja
  reunion: '#dc2626', // rojo
  consulta: '#2563eb', // azul
  otros: '#64748b', // gris
  bloqueo: '#16a34a', // verde
};

/** Gris neutro de las citas privadas ajenas. No configurable (ver arriba). */
export const COLOR_OCUPADO = '#94a3b8';

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido: se espera #rrggbb');

// `partial()`: la pantalla puede mandar solo lo que cambia, y el endpoint
// completa con los defectos.
export const coloresAgendaSchema = z
  .object({
    firma: hex,
    reunion: hex,
    consulta: hex,
    otros: hex,
    bloqueo: hex,
  })
  .partial();

export type ColoresAgenda = Record<CategoriaColor, string>;

/**
 * Categoría de color de un evento de la agenda.
 *
 * Una firma es una firma venga de donde venga: la firma prevista de un
 * expediente, un protocolo ya firmado y una cita manual de tipo FIRMA comparten
 * color, porque para quien mira la agenda son lo mismo. Antes cada una tenía el
 * suyo por venir de sitios distintos, que es una distinción nuestra, no suya.
 */
export function categoriaColor(ev: {
  kind: string;
  tipo?: string | null;
  meta?: Record<string, unknown> | null;
}): CategoriaColor | 'ocupado' {
  if (ev.kind === 'bloqueo') return 'bloqueo';
  if (ev.meta?.masked === true) return 'ocupado';
  if (ev.kind === 'expediente' || ev.kind === 'protocolo') return 'firma';
  switch (ev.tipo) {
    case 'FIRMA':
      return 'firma';
    case 'REUNION':
      return 'reunion';
    case 'CONSULTA':
      return 'consulta';
    default:
      return 'otros';
  }
}

/** Color final de un evento, dada la paleta de la notaría. */
export function colorDeEvento(
  ev: { kind: string; tipo?: string | null; meta?: Record<string, unknown> | null },
  colores: ColoresAgenda,
): string {
  const cat = categoriaColor(ev);
  return cat === 'ocupado' ? COLOR_OCUPADO : colores[cat];
}
