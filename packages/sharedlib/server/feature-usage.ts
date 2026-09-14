/**
 * Uso por funcionalidad — E4 de mycolegal-platform/PLAN_TECNICO_ESTADISTICAS_USO.md.
 *
 * `recordFeatureUse(permiso, orgId, userId)` se llama desde el gate
 * `withPermission` de cada app en el momento en que un permiso AUTORIZA una
 * llamada: ése es el instante en que se usa una funcionalidad, y la clave es
 * exactamente la del catálogo declarado (decisión D4). Un solo punto de enganche
 * por app, sin cablear funcionalidad a funcionalidad:
 *
 *   if (!allowed) return errorResponse('FORBIDDEN', …, 403);
 *   recordFeatureUse(permission, context.auth.orgId, context.auth.authUserId);
 *   return handler(request, context);
 *
 * ⚠️ Diseño dictado por la BD de destino (auth, la que llevamos protegiendo de
 * la saturación): NO se escribe nada por clic. Se acumula EN MEMORIA del
 * proceso, ya agregado por (funcionalidad, org, usuario, día), y se vuelca
 * cada 60 s en un solo POST a `AUTH_SERVICE_URL/internal/feature-usage`. Con
 * `max-instances=8`, el techo son 8 peticiones por minuto sea cual sea el
 * tráfico.
 *
 * Límite honesto que se acepta a cambio: una instancia que muere sin SIGTERM
 * limpio pierde hasta 60 s de contadores. Este dato NO sirve para facturar —
 * eso sigue en el ledger de créditos, que sí es transaccional.
 *
 * Fire-and-forget de verdad: ningún camino de aquí puede lanzar hacia una
 * pantalla de usuario. Si auth no está o falla, se descarta y se sigue.
 *
 * Requiere `AUTH_SERVICE_URL`, `APPS_REGISTER_SECRET` y `APP_SLUG` en el
 * entorno (los mismos que usa el auto-registro de la app); sin ellos no acumula
 * nada. Al añadir una app: enganchar su gate y declarar sus permisos gateados
 * en `mycolegal-platform/src/lib/app-features-map.ts` (`GATED`).
 */

const FLUSH_MS = 60_000;
/** Si el buffer crece más de esto entre volcados, se vuelca antes. Con un uso
 *  normal no se alcanza: son claves distintas (feature·org·usuario·día). */
const MAX_BUFFER = 2_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Entrada {
  featureKey: string;
  orgId: string;
  userId: string;
  day: string;
  uses: number;
  lastAt: string;
}

const buffer = new Map<string, Entrada>();
let timer: NodeJS.Timeout | null = null;
let hooked = false;
let flushing: Promise<void> | null = null;

function config(): { authUrl: string; secret: string; appSlug: string } | null {
  const authUrl = process.env.AUTH_SERVICE_URL;
  const secret = process.env.APPS_REGISTER_SECRET;
  const appSlug = process.env.APP_SLUG;
  if (!authUrl || !secret || !appSlug) return null;
  return { authUrl: authUrl.replace(/\/$/, ''), secret, appSlug };
}

export function recordFeatureUse(featureKey: string, orgId: string, userId: string): void {
  // Sin configuración (local sin auth, tests) no se acumula nada: el buffer
  // crecería sin que nadie lo vaciase.
  if (!config()) return;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(userId)) return;

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const k = `${featureKey}|${orgId}|${userId}|${day}`;
  const e = buffer.get(k);
  if (e) {
    e.uses += 1;
    e.lastAt = now.toISOString();
  } else {
    buffer.set(k, { featureKey, orgId, userId, day, uses: 1, lastAt: now.toISOString() });
  }
  armar();
  if (buffer.size >= MAX_BUFFER) void flushFeatureUsage();
}

function armar(): void {
  if (!timer) {
    timer = setTimeout(() => void flushFeatureUsage(), FLUSH_MS);
    // Que el temporizador no mantenga vivo el proceso por sí solo.
    timer.unref?.();
  }
  if (!hooked) {
    hooked = true;
    // Cloud Run manda SIGTERM antes de retirar la instancia: última oportunidad
    // de no perder lo acumulado. Next también escucha SIGTERM y puede salir
    // antes de que termine el POST — es la pérdida de ≤60 s que D2 asume.
    process.once('SIGTERM', () => void flushFeatureUsage());
    process.once('SIGINT', () => void flushFeatureUsage());
  }
}

export async function flushFeatureUsage(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing) return flushing;
  if (buffer.size === 0) return;
  const cfg = config();
  if (!cfg) {
    buffer.clear();
    return;
  }

  const entries = [...buffer.values()];
  buffer.clear();

  flushing = (async () => {
    try {
      await fetch(`${cfg.authUrl}/internal/feature-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': cfg.secret },
        body: JSON.stringify({ appSlug: cfg.appSlug, entries }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Se descarta a propósito. Reencolar reintentaría contra un auth caído
      // desde todas las instancias a la vez, que es lo contrario de lo que
      // este diseño quiere.
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
