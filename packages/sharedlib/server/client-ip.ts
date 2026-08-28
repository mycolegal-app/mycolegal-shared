import type { NextRequest } from 'next/server';

/**
 * Cabeceras que identifican al CLIENTE real y hay que propagar cuando una ruta
 * de app reenvía a auth.
 *
 * Sin esto, auth ve como origen la IP del propio servicio Next (todas las apps
 * salen por las mismas IPs de Cloud Run), así que cualquier rate-limit por IP
 * deja de ser "por cliente" y pasa a ser un cupo GLOBAL compartido por toda la
 * plataforma: bastaba con que unos pocos usuarios consumieran el cupo para que
 * el resto recibiera 429. Pasó con `/auth/reset-password/request` (3/hora
 * global) y afectaba igual a `/auth/login`.
 *
 * Cloud Run pone la IP real del cliente la primera en `x-forwarded-for` y auth
 * arranca con `trustProxy: true`, así que reenviar la cabecera tal cual basta
 * para que `request.ip` en auth sea la del usuario. Como efecto colateral, el
 * `audit_log` de auth deja de registrar `0.0.0.0` en estas rutas.
 *
 * Mismo criterio que ya seguían los proxies de alta del landing
 * (`/api/register/notaria`).
 */
export function clientForwardHeaders(request: NextRequest): Record<string, string> {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const userAgent = request.headers.get('user-agent');
  return {
    ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
    ...(userAgent ? { 'user-agent': userAgent } : {}),
  };
}
