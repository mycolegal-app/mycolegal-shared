import { describe, expect, it } from 'vitest';

import { buildAppMatrix, fromAppsCatalog, parseRolesMatrix, visibleRoles } from './roles-matrix';

// #1045 — matriz rol × permiso del manual, generada de los datos de auth.
const app = {
  slug: 'consultor',
  name: 'Consultor',
  roles: [
    { key: 'CONSULTOR', label: 'Consultor', permissions: ['consultas:read'] },
    { key: 'OBSERVADOR_NOTARIA', label: 'Observador', permissions: ['consultas:read'] },
    { key: 'ADMINISTRADOR_NOTARIA', label: 'Administrador de notaría', permissions: ['*'] },
    { key: 'USUARIO_NOTARIA', label: 'Usuario de notaría', isDefault: true, permissions: ['consultas:read', 'consultas:create', 'raro:x'] },
  ],
  permissions: [
    { key: 'consultas:read', label: 'Ver consultas', group: 'Consultas' },
    { key: 'consultas:create', label: 'Crear consultas', group: 'Consultas' },
    { key: 'resoluciones:review', label: 'Revisar resoluciones', group: 'Corpus', reserved: true },
  ],
};

describe('visibleRoles', () => {
  it('oculta los legacy y ordena por el catálogo unificado', () => {
    expect(visibleRoles(app.roles).map((r) => r.key)).toEqual([
      'ADMINISTRADOR_NOTARIA', 'USUARIO_NOTARIA', 'OBSERVADOR_NOTARIA',
    ]);
  });

  it('si la app sólo tiene legacy, los muestra', () => {
    expect(visibleRoles([{ key: 'EDITOR', label: 'Editor', permissions: ['*'] }])).toHaveLength(1);
  });
});

describe('buildAppMatrix', () => {
  const m = buildAppMatrix(app);

  it('el * cubre todo menos los reservados', () => {
    const corpus = m.groups.find((g) => g.group === 'Corpus')!;
    expect(corpus.rows[0].reserved).toBe(true);
    expect(corpus.rows[0].cells).toEqual([false, false, false]);
    const consultas = m.groups.find((g) => g.group === 'Consultas')!;
    expect(consultas.rows.find((r) => r.key === 'consultas:create')!.cells).toEqual([true, true, false]);
    expect(m.roles[0].fullAccess).toBe(true);
  });

  it('no esconde permisos que un rol tiene sin declarar', () => {
    const general = m.groups.find((g) => g.group === 'General')!;
    expect(general.rows.map((r) => r.key)).toEqual(['raro:x']);
    expect(general.rows[0].cells).toEqual([true, true, false]);
  });
});

describe('adaptadores', () => {
  it('parseRolesMatrix tolera el envoltorio data', () => {
    expect(parseRolesMatrix({ data: { scope: 'all', apps: [app], roleCatalog: [] } }).apps).toHaveLength(1);
    expect(parseRolesMatrix(null).apps).toEqual([]);
  });

  it('fromAppsCatalog agrupa por prefijo de la clave', () => {
    const d = fromAppsCatalog({ data: { apps: [{ slug: 'x', name: 'X', roles: app.roles }] } });
    expect(d.apps[0].permissions.map((p) => p.group)).toContain('Consultas');
  });
});
