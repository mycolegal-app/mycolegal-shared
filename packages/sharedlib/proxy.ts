// @mycolegal-app/sharedlib/proxy — proxy a auth (API histórica, sin parámetro
// `config`, usada por ~12 apps). Es un WRAPPER FINO sobre la implementación
// canónica `./server/auth-proxy`: inyecta AUTH_INTERNAL_URL/JWT_COOKIE_NAME
// desde `./config`. Así hay UNA sola lógica de 401/cookie/passthrough binario
// (antes estaba duplicada aquí y en server/auth-proxy, y ya habían divergido).
import { type NextRequest, type NextResponse } from 'next/server';
import { AUTH_INTERNAL_URL, JWT_COOKIE_NAME } from './config';
import {
  proxyToAuth as proxyToAuthImpl,
  fetchFromAuth as fetchFromAuthImpl,
} from './server/auth-proxy';

const config = () => ({
  jwtCookieName: JWT_COOKIE_NAME,
  authInternalUrl: AUTH_INTERNAL_URL,
});

/**
 * Proxies a request to the auth service, forwarding the JWT as a Bearer token.
 * Returns a SESSION_EXPIRED error and clears the cookie if auth returns 401.
 */
export function proxyToAuth(
  request: NextRequest,
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<NextResponse> {
  return proxyToAuthImpl(config(), request, path, options);
}

/**
 * Calls the auth service directly from a server context (not proxying a request).
 * Useful for API routes that need to make multiple calls to the auth service.
 */
export function fetchFromAuth(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: any }> {
  return fetchFromAuthImpl(config(), path, token, options);
}
