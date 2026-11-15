// Un solo sondeo de los contadores del Foro por página (14-nov-2026).
//
// El lanzador del Foro (en el sidebar de las 11 apps) sondeaba `/api/foro/unread` y
// `/api/foro/moderation` cada 45 s, los dos a la vez al cargar cada página, también con la
// pestaña oculta, y moderación seguía preguntando aunque respondiera 403 (no moderador). Cada
// petición resuelve permisos en el servidor: ~1.300 llamadas/día de cada una en PROD. Ahora, igual
// que las notificaciones (`no-leidas.ts`):
//   - una petición a `/api/foro/badge`, que devuelve `{ unread, moderation }` con exactamente lo
//     que devolvían `/unread` y `/moderation` (moderation = null si no es moderador);
//   - cada 90 s, y nada mientras la pestaña está oculta; al volver a ella se refresca en el acto;
//   - una sola instancia del sondeo aunque haya varios lanzadores montados (sidebar de escritorio
//     y móvil).
// Si la app (o su proxy) aún no tiene `/badge` (404/405), se vuelve a las dos peticiones de antes
// durante el resto de la sesión, sin reintentar `/badge` en cada vuelta; y tras un 403 de
// moderación se deja de preguntar por ella.

const SONDEO_MS = 90_000;
/** Foco y visibilidad llegan juntos al volver a la pestaña: una sola petición. */
const MARGEN_REFRESCO_MS = 5_000;

export interface ContadoresForo {
  /** No leídos; `null` mientras no se haya podido leer (se conserva el valor que hubiera). */
  unread: number | null;
  /** Reportes pendientes de moderar (0 si no es moderador). */
  modCount: number;
}

type Oyente = (estado: ContadoresForo) => void;

/** Por oyente: si quiere el contador de no leídos (no lo quiere quien tiene el Foro silenciado). */
const oyentes = new Map<Oyente, boolean>();
let estado: ContadoresForo | null = null;
let enCurso: Promise<void> | null = null;
let ultimaAt = 0;
let parar: (() => void) | null = null;
// Memoria de sesión (no se reinicia al parar el sondeo): ya sabemos que `/badge` no existe aquí
// o que el usuario no modera, y volver a preguntarlo solo gasta peticiones.
let sinBadge = false;
let sinModeracion = false;

const alguienQuiereUnread = () => [...oyentes.values()].some(Boolean);

function avisar(nuevo: ContadoresForo) {
  estado = nuevo;
  oyentes.forEach((_, o) => o(nuevo));
}

/** Mismo parseo que `/api/foro/unread`: `data.unread` o 0. */
const leerUnread = (data: { unread?: number } | null | undefined): number => data?.unread ?? 0;
/** Mismo parseo que `/api/foro/moderation`: longitud de la lista o 0. */
const leerModeracion = (data: unknown): number => (Array.isArray(data) ? data.length : 0);

/** Modo combinado. Devuelve false si `/badge` no existe y hay que usar las dos peticiones. */
async function pedirBadge(): Promise<boolean> {
  const r = await fetch("/api/foro/badge");
  if (r.status === 404 || r.status === 405) {
    sinBadge = true;
    return false;
  }
  if (!r.ok) {
    // Sin permiso de Foro: igual que el 403 de `/moderation` antes (marca a 0) y no leídos intactos.
    if (r.status === 403) avisar({ unread: estado?.unread ?? null, modCount: 0 });
    return true;
  }
  const j = await r.json();
  const d = j?.data;
  // `unread` trae el `data` de `/unread` ({ unread: n }); por si viniera ya como número, se acepta.
  const unread = typeof d?.unread === "number" ? d.unread : leerUnread(d?.unread);
  avisar({ unread, modCount: d?.moderation == null ? 0 : leerModeracion(d.moderation) });
  return true;
}

/** Modo de respaldo: las dos peticiones de siempre, con el mismo parseo que tenían. */
async function pedirPorSeparado(): Promise<void> {
  const quiereUnread = alguienQuiereUnread();
  const [unread, modCount] = await Promise.all([
    quiereUnread
      ? fetch("/api/foro/unread")
          .then(async (r) => (r.ok ? leerUnread((await r.json())?.data) : null))
          .catch(() => null)
      : Promise.resolve(null),
    sinModeracion
      ? Promise.resolve(0)
      : fetch("/api/foro/moderation")
          .then(async (r) => {
            if (!r.ok) {
              if (r.status === 403) {
                sinModeracion = true;
                return 0;
              }
              return null;
            }
            return leerModeracion((await r.json())?.data);
          })
          .catch(() => null),
  ]);
  avisar({
    unread: unread ?? estado?.unread ?? null,
    modCount: modCount ?? estado?.modCount ?? 0,
  });
}

function pedir(): Promise<void> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      if (sinBadge || !(await pedirBadge())) await pedirPorSeparado();
    } catch {
      // Silencioso: los contadores son cosméticos y el siguiente sondeo corrige.
    } finally {
      ultimaAt = Date.now();
      enCurso = null;
    }
  })();
  return enCurso;
}

function arrancar(): () => void {
  const alVolver = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - ultimaAt < MARGEN_REFRESCO_MS) return;
    void pedir();
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void pedir();
  }, SONDEO_MS);
  document.addEventListener("visibilitychange", alVolver);
  window.addEventListener("focus", alVolver);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", alVolver);
    window.removeEventListener("focus", alVolver);
  };
}

/**
 * Se suscribe a los contadores del Foro (solo con el usuario vinculado). `quiereUnread` = false
 * con el Foro silenciado: entonces, en modo de respaldo, no se pide `/unread`, como antes. El
 * primero que se suscribe arranca el sondeo y el último en irse lo para. Devuelve la baja.
 */
export function suscribirContadoresForo(oyente: Oyente, quiereUnread: boolean): () => void {
  // Al quitar el silencio se pedía el contador en el acto: se mantiene.
  const refrescar = !estado || (quiereUnread && !alguienQuiereUnread());
  oyentes.set(oyente, quiereUnread);
  if (estado) oyente(estado);
  if (refrescar) void pedir();
  if (!parar) parar = arrancar();
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0 && parar) {
      parar();
      parar = null;
      // Sin nadie mirando (p. ej. tras desvincular) el valor guardado caduca: el próximo que se
      // suscriba pide de nuevo en vez de pintar cifras viejas.
      estado = null;
    }
  };
}

/**
 * Fija el número de reportes pendientes tras verlos o resolverlos en el panel, para que todos los
 * lanzadores montados lo pinten ya sin esperar al siguiente sondeo.
 */
export function fijarModeracionForo(modCount: number): void {
  avisar({ unread: estado?.unread ?? null, modCount });
}
