import { describe, it, expect } from 'vitest';
import { provisionUserRole, type UserRoleRow, type UserRoleDelegate } from './auth-provision';

/** Un delegate en memoria con una sola fila. */
function delegate(fila: UserRoleRow<'NOTARIO'> | null) {
  let actual = fila;
  const d: UserRoleDelegate<'NOTARIO'> = {
    findUnique: async () => actual,
    findFirst: async ({ where }) => (actual && (where.active === undefined || actual.active === where.active) ? actual : null),
    upsert: async ({ update, create }) => {
      actual = actual ? { ...actual, ...(update as Partial<UserRoleRow<'NOTARIO'>>) } : { id: 'n', ...create };
      return actual;
    },
  };
  return { d, fila: () => actual };
}

const base = { authUserId: 'u1', orgId: 'o1', email: 'x@y.z', defaultRole: 'NOTARIO' as const };
const inactiva: UserRoleRow<'NOTARIO'> = { id: 'r1', authUserId: 'u1', orgId: 'o1', role: 'NOTARIO', active: false };

describe('provisionUserRole: ficha inactiva', () => {
  it('un superadmin la reactiva (la reconciliación de usuarios se la desactiva, 18-nov-2026)', async () => {
    const { d, fila } = delegate({ ...inactiva });
    const r = await provisionUserRole({ ...base, userRoleDelegate: d, authRole: 'superadmin' });
    expect(r?.active).toBe(true);
    expect(fila()?.active).toBe(true);
  });

  it('cualquier otro rol la deja inactiva', async () => {
    for (const authRole of ['org_admin', 'user', undefined]) {
      const { d, fila } = delegate({ ...inactiva });
      const r = await provisionUserRole({ ...base, userRoleDelegate: d, authRole });
      expect(r?.active).toBe(false);
      expect(fila()?.active).toBe(false);
    }
  });
});
