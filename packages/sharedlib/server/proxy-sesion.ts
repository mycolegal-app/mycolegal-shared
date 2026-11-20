// @mycolegal-app/sharedlib/server/proxy-sesion — el `proxy.ts` (antes middleware)
// de sesión de las apps, en UN sitio.
//
// Hasta el 20-nov-2026 cada app tenía su copia y habían divergido: consultor sólo
// miraba si EXISTÍA la cookie (vive 8 h) mientras las demás verificaban firma y
// caducidad del token (`timeout + 2` min), así que en consultor una sesión caducada
// servía la página y se pintaba con errores hasta que el primer 401 mandaba al
// login. El bloqueo de organización en baja (DPA §8) hubo que copiarlo a mano en
// once ficheros ese mismo día. Lo común vive aquí; cada app sólo declara lo suyo.
//
// Lo que NO puede vivir aquí es el `matcher`: Next lo lee al compilar y exige un
// literal en el propio `src/proxy.ts` de la app. Sigue siendo de cada app.
//
// Uso:
//   import { crearProxyDeSesion } from '@mycolegal-app/sharedlib/server/proxy-sesion';
//   export const proxy = crearProxyDeSesion();
//   export const config = { matcher: ['/((?!_next/static|…).*)'] };

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify, type JWTPayload } from 'jose';

const MSG_SIN_SESION = 'Autenticación requerida';
const MSG_SESION_INVALIDA = 'Sesión inválida o expirada';
const MSG_ORG_EN_BAJA =
  'Tu organización está en baja: puedes consultar tus datos, pero no crear ni modificar nada.';
const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cookie de sesión SSO. Se lee en cada llamada (como en `config.ts`) para que la
 *  misma imagen sirva en PROD y en TEST (`COOKIE_PREFIX=test-`). */
function cookieDeSesion(): string {
  return `${process.env.COOKIE_PREFIX || ''}mycolegal-token`;
}

/** Verificación por defecto: firma HS256 + caducidad + `sub` y `orgId`. */
export async function verificarTokenDeSesion(token: string): Promise<JWTPayload> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || '');
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
  if (!payload.sub || !payload.orgId) throw new Error('Missing required claims');
  return payload;
}

/**
 * ¿Esta petición la bloquea el estado EN BAJA de la organización?
 * Se entra y se consulta, pero no se escribe. Un superadmin de pleno derecho (no
 * suplantando) sí escribe: es quien atiende la baja. Los endpoints de auth
 * (login, refresh, logout…) nunca se bloquean.
 */
export function bloqueadaPorOrgEnBaja(payload: JWTPayload, request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return (
    payload.orgEnBaja === true &&
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth/') &&
    !METODOS_DE_LECTURA.has(request.method) &&
    !(payload.role === 'superadmin' && !payload.impersonatedBy)
  );
}

export interface ContextoProxy {
  request: NextRequest;
  pathname: string;
  esApi: boolean;
  /** JSON `{error:{code,message}}` en /api; redirección al login en páginas
   *  (con `query` añadido a la URL de login, p.ej. `{error:'forbidden'}`). */
  denegar: (status: number, code: string, message: string, query?: Record<string, string>) => NextResponse;
}

type Quizas<T> = T | undefined | null | void;

export interface OpcionesProxySesion {
  /**
   * Corre ANTES de mirar la sesión. Si devuelve una respuesta, se usa tal cual.
   * Para lo que no depende del usuario: modo mantenimiento, tráfico de servicio
   * (`X-Service-Key`), el plano público de web…
   */
  antes?: (request: NextRequest) => Quizas<Response> | Promise<Quizas<Response>>;
  /** Rutas que el matcher deja entrar pero se sirven SIN sesión. */
  esPublica?: (pathname: string, request: NextRequest) => boolean;
  /**
   * Qué hacer en `/api/*` sin sesión válida:
   *  - `'exigir'` (por defecto): 401 JSON aquí mismo.
   *  - `'delegar'`: dejar pasar y que cada ruta decida (consultor). El bloqueo de
   *    organización en baja se aplica igual si la sesión SÍ es válida.
   * Las páginas siempre van al login.
   */
  api?: 'exigir' | 'delegar';
  /** Verificación del token (por defecto `verificarTokenDeSesion`). */
  verificar?: (token: string) => Promise<JWTPayload>;
  /** Regla propia con la sesión ya verificada (p.ej. rol de admin en config). */
  autorizar?: (payload: JWTPayload, ctx: ContextoProxy) => Quizas<Response> | Promise<Quizas<Response>>;
  /** Respuesta cuando todo pasa (por defecto `NextResponse.next()`). */
  alPasar?: (payload: JWTPayload, request: NextRequest) => Quizas<Response>;
  /** Página de login (por defecto `/login`). */
  rutaLogin?: string;
  /**
   * Bloquear la escritura de una organización EN BAJA (por defecto sí). Config la
   * desactiva: es desde donde el administrador ANULA la baja, y eso escribe.
   */
  bloquearOrgEnBaja?: boolean;
}

export function crearProxyDeSesion(opciones: OpcionesProxySesion = {}) {
  const {
    antes, esPublica, api = 'exigir', verificar = verificarTokenDeSesion,
    autorizar, alPasar, rutaLogin = '/login', bloquearOrgEnBaja = true,
  } = opciones;

  return async function proxy(request: NextRequest): Promise<Response> {
    if (antes) {
      const r = await antes(request);
      if (r) return r;
    }

    const { pathname } = request.nextUrl;
    const esApi = pathname.startsWith('/api/');

    const denegar: ContextoProxy['denegar'] = (status, code, message, query) => {
      if (esApi) return NextResponse.json({ error: { code, message } }, { status });
      const url = new URL(rutaLogin, request.url);
      for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
      return NextResponse.redirect(url);
    };

    if (esPublica?.(pathname, request)) return NextResponse.next();

    const token = request.cookies.get(cookieDeSesion())?.value;
    let payload: JWTPayload | null = null;
    if (token) {
      try {
        payload = await verificar(token);
      } catch {
        payload = null;
      }
    }

    if (!payload) {
      if (esApi && api === 'delegar') return NextResponse.next();
      return denegar(401, 'UNAUTHORIZED', token ? MSG_SESION_INVALIDA : MSG_SIN_SESION);
    }

    if (bloquearOrgEnBaja && bloqueadaPorOrgEnBaja(payload, request)) {
      return NextResponse.json(
        { error: { code: 'ORG_EN_BAJA', message: MSG_ORG_EN_BAJA } },
        { status: 423 },
      );
    }

    if (autorizar) {
      const r = await autorizar(payload, { request, pathname, esApi, denegar });
      if (r) return r;
    }

    return alPasar?.(payload, request) ?? NextResponse.next();
  };
}

/**
 * Modo mantenimiento de la app (auth `/apps/<slug>/status`, caché 30 s). Devuelve
 * una función para `antes`: redirige a `/maintenance` y borra la cookie de sesión
 * mientras dure. No toca `/maintenance` ni `/api/auth/*`. Si auth no responde, se
 * asume que NO hay mantenimiento: no se bloquea a nadie por un fallo de red.
 */
export function crearComprobadorDeMantenimiento(opciones: { appSlug?: string; authUrl?: string } = {}) {
  const appSlug = opciones.appSlug || process.env.APP_SLUG || '';
  const authUrl = opciones.authUrl || process.env.AUTH_SERVICE_URL || 'https://auth.mycolegal.app';
  const TTL_MS = 30_000;
  let cache: { maintenance: boolean; maintenanceEnd?: string; maintenanceMessage?: string; expiresAt: number } | null = null;

  async function estado() {
    const now = Date.now();
    if (cache && now < cache.expiresAt) return cache;
    try {
      const res = await fetch(`${authUrl}/apps/${appSlug}/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        cache = { ...data, expiresAt: now + TTL_MS };
        return cache!;
      }
    } catch {
      // red caída: no hay mantenimiento
    }
    return { maintenance: false } as const;
  }

  return async function comprobarMantenimiento(request: NextRequest): Promise<NextResponse | undefined> {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith('/maintenance') || pathname.startsWith('/api/auth/')) return undefined;
    const s = await estado();
    if (!s.maintenance) return undefined;
    const url = new URL('/maintenance', request.url);
    url.searchParams.set('until', ('maintenanceEnd' in s && s.maintenanceEnd) || '');
    url.searchParams.set('message', ('maintenanceMessage' in s && s.maintenanceMessage) || '');
    const res = NextResponse.redirect(url);
    res.cookies.delete(cookieDeSesion());
    return res;
  };
}
