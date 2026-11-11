// Un solo sondeo de notificaciones no leídas por página (11-nov-2026).
//
// La campana (`unread-count` cada 30 s) y la barra de apps (`unread-by-app` cada 60 s) sondeaban
// cada una por su lado y seguían haciéndolo con la pestaña oculta: un notario con tres pestañas
// olvidadas eran ~360 peticiones/hora a auth sin mirar la pantalla. Ahora:
//   - una petición a `unread-by-app`, que desde el 11-nov trae también el total (`unread`);
//   - cada 90 s, y nada mientras la pestaña está oculta; al volver a ella (o al recuperar el foco)
//     se refresca en el acto;
//   - como cada clic recarga la página, el contador se pone al día al navegar: el sondeo solo
//     cubre a quien se queda quieto en una pantalla.
// Si auth aún no trae `unread` (despliegue anterior), se pide aparte `unread-count`.

const SONDEO_MS = 90_000;
/** Foco y visibilidad llegan juntos al volver a la pestaña: una sola petición. */
const MARGEN_REFRESCO_MS = 5_000;

export interface NoLeidas {
  unread: number;
  byApp: Record<string, number>;
}

type Oyente = (estado: NoLeidas) => void;

interface Sondeo {
  estado: NoLeidas | null;
  oyentes: Set<Oyente>;
  enCurso: Promise<void> | null;
  ultimaAt: number;
  parar: (() => void) | null;
}

const sondeos = new Map<string, Sondeo>();

async function pedirTotalAparte(apiBase: string): Promise<number> {
  const res = await fetch(`${apiBase}/unread-count`, { credentials: "include" });
  const json = res.ok ? await res.json() : null;
  return typeof json?.unread === "number" ? json.unread : 0;
}

function pedir(apiBase: string, s: Sondeo): Promise<void> {
  if (s.enCurso) return s.enCurso;
  s.enCurso = (async () => {
    try {
      const res = await fetch(`${apiBase}/unread-by-app`, { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      const unread = typeof json?.unread === "number" ? json.unread : await pedirTotalAparte(apiBase);
      s.estado = { unread, byApp: (json?.byApp ?? {}) as Record<string, number> };
      s.oyentes.forEach((o) => o(s.estado!));
    } catch {
      // Silencioso: los contadores son cosméticos y el siguiente sondeo corrige.
    } finally {
      s.ultimaAt = Date.now();
      s.enCurso = null;
    }
  })();
  return s.enCurso;
}

function arrancar(apiBase: string, s: Sondeo): () => void {
  const alVolver = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - s.ultimaAt < MARGEN_REFRESCO_MS) return;
    void pedir(apiBase, s);
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void pedir(apiBase, s);
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
 * Se suscribe a los contadores de no leídas. El primero que se suscribe arranca el sondeo y el
 * último en irse lo para. Devuelve la función para darse de baja.
 */
export function suscribirNoLeidas(apiBase: string, oyente: Oyente): () => void {
  let s = sondeos.get(apiBase);
  if (!s) {
    s = { estado: null, oyentes: new Set(), enCurso: null, ultimaAt: 0, parar: null };
    sondeos.set(apiBase, s);
  }
  const sondeo = s;
  sondeo.oyentes.add(oyente);
  if (sondeo.estado) oyente(sondeo.estado);
  else void pedir(apiBase, sondeo);
  if (!sondeo.parar) sondeo.parar = arrancar(apiBase, sondeo);
  return () => {
    sondeo.oyentes.delete(oyente);
    if (sondeo.oyentes.size === 0 && sondeo.parar) {
      sondeo.parar();
      sondeo.parar = null;
    }
  };
}

/** Pide ya los contadores (p. ej. tras marcar como leídas) y avisa a todos los suscritos. */
export function refrescarNoLeidas(apiBase: string): Promise<void> {
  const s = sondeos.get(apiBase);
  return s ? pedir(apiBase, s) : Promise.resolve();
}
