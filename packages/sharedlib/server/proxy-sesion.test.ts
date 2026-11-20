import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { crearProxyDeSesion, crearComprobadorDeMantenimiento } from './proxy-sesion';

const SECRETO = 'secreto-de-prueba-proxy-sesion';
const BASE = 'http://consultor.mycolegal.local';

async function token(claims: Record<string, unknown>, caducaEnSeg = 600, secreto = SECRETO) {
  const ahora = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(ahora - 60)
    .setExpirationTime(ahora + caducaEnSeg)
    .sign(new TextEncoder().encode(secreto));
}

function peticion(ruta: string, { cookie, method = 'GET', headers = {} }: { cookie?: string; method?: string; headers?: Record<string, string> } = {}) {
  const h = new Headers(headers);
  if (cookie) h.set('cookie', `mycolegal-token=${cookie}`);
  return new NextRequest(new URL(ruta, BASE), { method, headers: h });
}

const sigue = (r: Response) => r.headers.get('x-middleware-next') === '1';
const aLogin = (r: Response) => r.status === 307 && new URL(r.headers.get('location')!).pathname === '/login';

const USUARIO = { sub: 'u1', orgId: 'o1', role: 'user' };

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', SECRETO);
  vi.stubEnv('COOKIE_PREFIX', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('crearProxyDeSesion — páginas', () => {
  const proxy = crearProxyDeSesion();

  it('sesión válida: sigue', async () => {
    expect(sigue(await proxy(peticion('/consultas', { cookie: await token(USUARIO) })))).toBe(true);
  });

  it('sin cookie: al login', async () => {
    expect(aLogin(await proxy(peticion('/consultas')))).toBe(true);
  });

  // El caso que motivó todo esto (consultor, 20-nov-2026): cookie presente,
  // token caducado. Antes se servía la página.
  it('token CADUCADO con la cookie aún viva: al login, no se sirve la página', async () => {
    expect(aLogin(await proxy(peticion('/consultas', { cookie: await token(USUARIO, -30) })))).toBe(true);
  });

  it('firma de otro secreto: al login', async () => {
    expect(aLogin(await proxy(peticion('/consultas', { cookie: await token(USUARIO, 600, 'otro') })))).toBe(true);
  });

  it('sin orgId: al login', async () => {
    expect(aLogin(await proxy(peticion('/consultas', { cookie: await token({ sub: 'u1' }) })))).toBe(true);
  });

  it('respeta COOKIE_PREFIX de TEST', async () => {
    vi.stubEnv('COOKIE_PREFIX', 'test-');
    const t = await token(USUARIO);
    const r = await proxy(new NextRequest(new URL('/x', BASE), { headers: { cookie: `test-mycolegal-token=${t}` } }));
    expect(sigue(r)).toBe(true);
    expect(aLogin(await proxy(peticion('/x', { cookie: t })))).toBe(true);
  });
});

describe('crearProxyDeSesion — /api', () => {
  it('por defecto exige sesión: 401 JSON y mensaje según el caso', async () => {
    const proxy = crearProxyDeSesion();
    const sin = await proxy(peticion('/api/datos'));
    expect(sin.status).toBe(401);
    expect((await sin.json()).error).toEqual({ code: 'UNAUTHORIZED', message: 'Autenticación requerida' });
    const cad = await proxy(peticion('/api/datos', { cookie: await token(USUARIO, -30) }));
    expect(cad.status).toBe(401);
    expect((await cad.json()).error.message).toBe('Sesión inválida o expirada');
  });

  it("'delegar' deja pasar sin sesión (decide la ruta), pero no las páginas", async () => {
    const proxy = crearProxyDeSesion({ api: 'delegar' });
    expect(sigue(await proxy(peticion('/api/datos', { method: 'POST' })))).toBe(true);
    expect(sigue(await proxy(peticion('/api/datos', { cookie: await token(USUARIO, -30), method: 'POST' })))).toBe(true);
    expect(aLogin(await proxy(peticion('/consultas', { cookie: await token(USUARIO, -30) })))).toBe(true);
  });
});

describe('crearProxyDeSesion — organización en baja', () => {
  const EN_BAJA = { ...USUARIO, orgEnBaja: true };

  for (const api of ['exigir', 'delegar'] as const) {
    it(`[${api}] escribir → 423; leer, auth y superadmin pasan`, async () => {
      const proxy = crearProxyDeSesion({ api });
      const t = await token(EN_BAJA);
      const r = await proxy(peticion('/api/expedientes', { cookie: t, method: 'POST' }));
      expect(r.status).toBe(423);
      expect((await r.json()).error.code).toBe('ORG_EN_BAJA');
      expect(sigue(await proxy(peticion('/api/expedientes', { cookie: t })))).toBe(true);
      expect(sigue(await proxy(peticion('/api/auth/refresh', { cookie: t, method: 'POST' })))).toBe(true);
      expect(sigue(await proxy(peticion('/expedientes', { cookie: t })))).toBe(true);
      const sa = await token({ ...EN_BAJA, role: 'superadmin' });
      expect(sigue(await proxy(peticion('/api/expedientes', { cookie: sa, method: 'POST' })))).toBe(true);
      const suplantando = await token({ ...EN_BAJA, role: 'superadmin', impersonatedBy: 'x' });
      expect((await proxy(peticion('/api/expedientes', { cookie: suplantando, method: 'DELETE' }))).status).toBe(423);
    });
  }
});

describe('crearProxyDeSesion — organización en baja desactivado (config)', () => {
  it('bloquearOrgEnBaja:false deja escribir (anular la baja)', async () => {
    const proxy = crearProxyDeSesion({ bloquearOrgEnBaja: false });
    const t = await token({ ...USUARIO, orgEnBaja: true });
    expect(sigue(await proxy(peticion('/api/orgs/o1/baja/anular', { cookie: t, method: 'POST' })))).toBe(true);
  });
});

describe('crearProxyDeSesion — ganchos', () => {
  it('esPublica: se sirve sin sesión', async () => {
    const proxy = crearProxyDeSesion({ esPublica: (p) => p.startsWith('/api/publico/') });
    expect(sigue(await proxy(peticion('/api/publico/x')))).toBe(true);
    expect((await proxy(peticion('/api/privado/x'))).status).toBe(401);
  });

  it('antes: su respuesta manda y no se mira la sesión', async () => {
    const proxy = crearProxyDeSesion({ antes: () => NextResponse.json({ ok: 1 }, { status: 400 }) });
    expect((await proxy(peticion('/api/x'))).status).toBe(400);
  });

  it('autorizar con denegar: 403 JSON en /api, login?error=forbidden en páginas', async () => {
    const proxy = crearProxyDeSesion({
      autorizar: (p, ctx) => (p.role === 'org_admin' ? undefined : ctx.denegar(403, 'FORBIDDEN', 'No', { error: 'forbidden' })),
    });
    const t = await token(USUARIO);
    expect((await proxy(peticion('/api/x', { cookie: t }))).status).toBe(403);
    const pag = await proxy(peticion('/organizacion', { cookie: t }));
    expect(new URL(pag.headers.get('location')!).searchParams.get('error')).toBe('forbidden');
    expect(sigue(await proxy(peticion('/organizacion', { cookie: await token({ ...USUARIO, role: 'org_admin' }) })))).toBe(true);
  });

  it('alPasar: sustituye la respuesta final', async () => {
    const proxy = crearProxyDeSesion({ alPasar: () => NextResponse.json({}, { status: 202 }) });
    expect((await proxy(peticion('/x', { cookie: await token(USUARIO) }))).status).toBe(202);
  });

  it('verificar propio (admin: sin orgId)', async () => {
    const proxy = crearProxyDeSesion({ verificar: async () => ({ sub: 'sa' }) });
    expect(sigue(await proxy(peticion('/x', { cookie: 'cualquiera' })))).toBe(true);
  });
});

describe('crearComprobadorDeMantenimiento', () => {
  it('en mantenimiento: redirige a /maintenance y borra la cookie; no toca /api/auth', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ maintenance: true, maintenanceEnd: '18:00', maintenanceMessage: 'Ventana' }), { status: 200 }),
    );
    const comprobar = crearComprobadorDeMantenimiento({ appSlug: 'redactor', authUrl: 'http://auth' });
    const r = (await comprobar(peticion('/casos')))!;
    const loc = new URL(r.headers.get('location')!);
    expect(loc.pathname).toBe('/maintenance');
    expect(loc.searchParams.get('until')).toBe('18:00');
    expect(r.headers.get('set-cookie')).toMatch(/mycolegal-token=;/);
    expect(await comprobar(peticion('/api/auth/login'))).toBeUndefined();
    await comprobar(peticion('/otra'));
    expect(f).toHaveBeenCalledTimes(1); // caché de 30 s
    expect(f.mock.calls[0]![0]).toBe('http://auth/apps/redactor/status');
  });

  it('auth caído: no hay mantenimiento', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const comprobar = crearComprobadorDeMantenimiento({ appSlug: 'web', authUrl: 'http://auth' });
    expect(await comprobar(peticion('/'))).toBeUndefined();
  });
});
