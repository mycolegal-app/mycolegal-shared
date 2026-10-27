import { describe, it, expect, vi, afterEach } from 'vitest';
import { mirrorOrgAndRole, type LoginProvisionContext } from './login-route';

/**
 * #1045 — El login de LegiFirma reescribía el rol local en cada entrada con
 * `toLocalAppRole(appRoleKey)`, y para un grant A MEDIDA (sin `appRoleKey`) eso
 * caía a AUXILIAR, pisando lo que hubiera. Con `roleFromPermissions` el rol se
 * deduce de los permisos y, si no se puede, la fila conserva el suyo.
 */

type Role = 'NOTARIO' | 'OFICIAL' | 'AUXILIAR';

function setup(authResponse: { ok: boolean; body?: unknown } | 'throw') {
  const upserts: any[] = [];
  const organizationDelegate = {
    updateMany: vi.fn(async () => ({ count: 0 })),
    upsert: vi.fn(async () => ({})),
  };
  const userRoleDelegate = {
    upsert: vi.fn(async (args: any) => {
      upserts.push(args);
      return {};
    }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (authResponse === 'throw') throw new Error('auth caído');
      return {
        ok: authResponse.ok,
        json: async () => authResponse.body,
      } as Response;
    }),
  );
  const ctx: LoginProvisionContext = {
    user: {
      id: 'u1',
      email: 'u@x.es',
      displayName: 'U',
      role: 'user',
      orgId: 'o1',
      orgSlug: 'org',
    },
    accessToken: 't',
    authInternalUrl: 'http://auth',
  };
  return { upserts, organizationDelegate, userRoleDelegate, ctx };
}

const roleFromPermissions = (p: readonly string[]): Role | null =>
  p.includes('*') ? 'NOTARIO' : p.includes('actuaciones:estado:procesamiento') ? 'OFICIAL' : null;

function provision(s: ReturnType<typeof setup>, withDeduction = true) {
  return mirrorOrgAndRole<Role>({
    organizationDelegate: s.organizationDelegate,
    userRoleDelegate: s.userRoleDelegate,
    roleMap: { superadmin: 'NOTARIO', org_admin: 'NOTARIO', user: 'AUXILIAR' },
    defaultRole: 'AUXILIAR',
    centralizedRoleApp: 'legifirma',
    mapCentralizedRole: (key, fallback) => (key === 'USUARIO_NOTARIA' ? 'OFICIAL' : fallback),
    updateRoleOnLogin: true,
    ...(withDeduction ? { roleFromPermissions } : {}),
  })(s.ctx);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mirrorOrgAndRole — rol local en el login', () => {
  it('grant a medida: deduce el rol de los permisos en vez de caer a AUXILIAR', async () => {
    const s = setup({
      ok: true,
      body: { data: { appRoleKey: null, permissions: ['actuaciones:read', 'actuaciones:estado:procesamiento'] } },
    });
    await provision(s);
    expect(s.upserts[0].update.role).toBe('OFICIAL');
    expect(s.upserts[0].create.role).toBe('OFICIAL');
  });

  it('grant a medida que no encaja con ningún rol: NO reescribe el rol existente', async () => {
    const s = setup({ ok: true, body: { data: { appRoleKey: null, permissions: ['libro:read'] } } });
    await provision(s);
    expect(s.upserts[0].update).not.toHaveProperty('role');
    // La fila nueva sí necesita un rol: el del mapa.
    expect(s.upserts[0].create.role).toBe('AUXILIAR');
  });

  it('auth caído: no pisa el rol existente', async () => {
    const s = setup('throw');
    await provision(s);
    expect(s.upserts[0].update).not.toHaveProperty('role');
  });

  it('con rol del catálogo: lo traduce como siempre', async () => {
    const s = setup({ ok: true, body: { data: { appRoleKey: 'USUARIO_NOTARIA', permissions: [] } } });
    await provision(s);
    expect(s.upserts[0].update.role).toBe('OFICIAL');
  });

  it('sin roleFromPermissions (consultor) el comportamiento no cambia: rol del mapa', async () => {
    const s = setup({ ok: true, body: { data: { appRoleKey: null, permissions: ['libro:read'] } } });
    await provision(s, false);
    expect(s.upserts[0].update.role).toBe('AUXILIAR');
  });
});
