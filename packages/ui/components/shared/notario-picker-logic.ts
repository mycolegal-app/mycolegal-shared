// #1011 — Lógica pura del NotarioPicker (sin React), para poder probarla.

/** Mínimo de caracteres para que un texto libre cuente como «notario a mano». */
export const MIN_CHARS_ALTA_MANUAL = 3;

export interface EstadoAvisoAlta {
  /** El texto lo ha tecleado el usuario (no viene de elegir del catálogo). */
  escritoAMano: boolean;
  texto: string;
  /** Búsqueda en curso (aún no sabemos si está en el catálogo). */
  cargando: boolean;
  /** El desplegable está abierto y ofrece candidatos del catálogo. */
  hayCandidatosVisibles: boolean;
  /** El usuario cerró el aviso. */
  descartado: boolean;
}

/**
 * ¿Pintamos el aviso «este notario no está en el directorio: pide que lo den de
 * alta»? Solo cuando el usuario ha escrito un nombre a mano (no al cargar un
 * valor guardado), con texto suficiente, sin búsqueda pendiente y sin
 * candidatos a la vista que pueda estar a punto de elegir. Nunca bloquea nada:
 * es un aviso descartable.
 */
export function debeMostrarAvisoAlta(e: EstadoAvisoAlta): boolean {
  if (!e.escritoAMano || e.descartado || e.cargando || e.hayCandidatosVisibles) return false;
  return e.texto.trim().length >= MIN_CHARS_ALTA_MANUAL;
}

export interface DatosAltaNotario {
  nombre: string;
  poblacion?: string | null;
  provincia?: string | null;
}

/**
 * Texto de la propuesta que llega a soporte. Va en castellano a propósito: lo
 * lee el equipo de soporte, no el usuario, y así todas las peticiones de alta se
 * reconocen y filtran igual sea cual sea el idioma de la interfaz.
 */
export function textoAltaNotario(d: DatosAltaNotario): string {
  const partes = [d.nombre, d.poblacion, d.provincia]
    .map((p) => (p ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean);
  // Sin repetir población = provincia («Madrid, Madrid»).
  const unicas = partes.filter((p, i) => partes.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return `Alta de notario en el directorio: ${unicas.join(", ")}`;
}

/** Clave para recordar a qué texto ya se le pidió el alta (no duplicar envíos). */
export function claveAlta(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase();
}
