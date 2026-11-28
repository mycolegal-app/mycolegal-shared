// @mycolegal-app/sharedlib/org-entitlement — ¿la ORGANIZACIÓN tiene una app contratada?
//
// Pregunta a auth (`GET /internal/orgs/:orgId/apps/:slug`, con la clave de servicio): la fuente de
// verdad de OrgApp. No depende de los permisos de quien hace la petición (para eso está
// `org-apps.ts`, que mira las apps del USUARIO por su JWT): un oficial sin acceso a FacturaE no
// debe decidir si la factura de una notaría que SÍ la tiene llega a su registro.
//
// Unifica las copias que había en consultor (`orgHasApp`, MycoBot por el canal inter) y redactor
// (`orgTieneRedactor`) y la que necesitaban LegiFirma y Pólizas (27-nov-2026).
//
// Si auth no responde, el llamante decide (`siFalla`):
//   · 'conceder' — no tumbar un servicio por un parpadeo de auth (MycoBot, Redactor);
//   · 'denegar'  — no escribir en otra app que quizá la org no tiene (registro en FacturaE).
// Un fallo no se cachea; una respuesta de auth, sí (TTL configurable).
import { AUTH_INTERNAL_URL } from './config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ¿Es un id de organización real? El puente de Telegram usa el centinela `_system` cuando quien
 * escribe no tiene identidad vinculada; auth responde 500 con un id que no es UUID.
 */
export function isRealOrgId(orgId: string): boolean {
  return UUID_RE.test(orgId);
}

export interface OrgHasAppOptions {
  /** Qué devolver si auth no responde o no hay clave de servicio. */
  siFalla: 'conceder' | 'denegar';
  /** Qué devolver si el orgId no es una org real (p. ej. `_system`). Por defecto, lo mismo que `siFalla`. */
  sinOrgReal?: boolean;
  /** Caché de la respuesta de auth, en ms. Por defecto 60 s. */
  ttlMs?: number;
}

const cache = new Map<string, { activa: boolean; hasta: number }>();

export async function orgHasApp(orgId: string, slug: string, opts: OrgHasAppOptions): Promise<boolean> {
  const siFalla = opts.siFalla === 'conceder';
  if (!isRealOrgId(orgId)) return opts.sinOrgReal ?? siFalla;
  const k = `${orgId}|${slug}`;
  const c = cache.get(k);
  const ahora = Date.now();
  if (c && c.hasta > ahora) return c.activa;
  const clave = process.env.APPS_REGISTER_SECRET || process.env.INTER_SERVICE_KEY || '';
  if (!clave) return siFalla;
  try {
    const res = await fetch(
      `${AUTH_INTERNAL_URL.replace(/\/$/, '')}/internal/orgs/${encodeURIComponent(orgId)}/apps/${encodeURIComponent(slug)}`,
      { headers: { 'X-Service-Key': clave }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return siFalla;
    const json = (await res.json().catch(() => null)) as { data?: { active?: unknown } } | null;
    const active = json?.data?.active;
    // Sólo un booleano de auth es una respuesta: otra cosa (cuerpo raro) cuenta como fallo, no se
    // cachea y decide `siFalla` (con 'conceder', sólo un `active:false` explícito niega; Redactor).
    if (typeof active !== 'boolean') return siFalla;
    cache.set(k, { activa: active, hasta: ahora + (opts.ttlMs ?? 60_000) });
    return active;
  } catch {
    return siFalla;
  }
}

/** Sólo para pruebas. */
export function _limpiarCacheOrgHasApp(): void {
  cache.clear();
}
