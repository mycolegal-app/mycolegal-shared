import { describe, it, expect } from 'vitest';
import {
  ROL_A_MEDIDA,
  cambiosDeRoles,
  etiquetaRolApp,
  rolesInicialesPorApp,
  sustituyeAMedida,
} from './user-app-roles';

/**
 * #1045 — Una usuaria con permisos a medida en LegiFirma los perdió al guardar
 * el modal de usuarios: la fila salía «sin acceso», al marcarla se aplicaba el
 * rol por defecto y auth sustituía sus permisos por los del rol.
 */

describe('rolesInicialesPorApp', () => {
  it('app actual: rol según auth, no la fila local', () => {
    const m = rolesInicialesPorApp(
      { role: 'AUXILIAR', hasAppAccess: true, appRoleKey: 'USUARIO_NOTARIA' },
      'legifirma',
    );
    expect(m.get('legifirma')).toBe('USUARIO_NOTARIA');
  });

  it('app actual a medida: «A medida», no el rol local', () => {
    const m = rolesInicialesPorApp({ role: 'AUXILIAR', hasAppAccess: true, appRoleKey: null }, 'legifirma');
    expect(m.get('legifirma')).toBe(ROL_A_MEDIDA);
  });

  it('servidor antiguo (sin appRoleKey): cae al rol local', () => {
    const m = rolesInicialesPorApp({ role: 'OFICIAL', hasAppAccess: true }, 'notaria');
    expect(m.get('notaria')).toBe('OFICIAL');
  });

  it('sin acceso a la app actual: no aparece', () => {
    expect(rolesInicialesPorApp({ role: null, hasAppAccess: false, appRoleKey: null }, 'x').has('x')).toBe(false);
  });

  it('otras apps a medida: con acceso, no «sin acceso»', () => {
    const m = rolesInicialesPorApp(
      { hasAppAccess: false, otherApps: [{ slug: 'legifirma', appRoleKey: null }, { slug: 'notaria', appRoleKey: 'X' }] },
      'consultor',
    );
    expect(m.get('legifirma')).toBe(ROL_A_MEDIDA);
    expect(m.get('notaria')).toBe('X');
  });
});

describe('cambiosDeRoles', () => {
  const inicial = new Map([
    ['legifirma', ROL_A_MEDIDA],
    ['notaria', 'USUARIO_NOTARIA'],
  ]);

  it('sin tocar la fila a medida no se envía nada para ella', () => {
    expect(cambiosDeRoles(inicial, new Map(inicial))).toEqual({ grants: [], removeApps: [] });
  });

  it('cambiar otra app no arrastra la fila a medida', () => {
    const actual = new Map(inicial).set('notaria', 'OBSERVADOR_NOTARIA');
    expect(cambiosDeRoles(inicial, actual)).toEqual({
      grants: [{ slug: 'notaria', appRoleKey: 'OBSERVADOR_NOTARIA' }],
      removeApps: [],
    });
  });

  it('elegir un rol a propósito en la fila a medida sí se envía (y se avisa)', () => {
    const actual = new Map(inicial).set('legifirma', 'USUARIO_NOTARIA');
    expect(cambiosDeRoles(inicial, actual).grants).toEqual([{ slug: 'legifirma', appRoleKey: 'USUARIO_NOTARIA' }]);
    expect(sustituyeAMedida(inicial, actual, 'legifirma')).toBe(true);
    expect(sustituyeAMedida(inicial, inicial, 'legifirma')).toBe(false);
    expect(sustituyeAMedida(inicial, actual, 'notaria')).toBe(false);
  });

  it('quitar el acceso a una app a medida la revoca', () => {
    const actual = new Map(inicial);
    actual.delete('legifirma');
    expect(cambiosDeRoles(inicial, actual).removeApps).toEqual(['legifirma']);
  });
});

describe('etiquetaRolApp', () => {
  const roles = [{ key: 'USUARIO_NOTARIA', label: 'Usuario (LegiFirma)' }];
  it('prefiere la etiqueta del catálogo de la app', () => {
    expect(etiquetaRolApp('USUARIO_NOTARIA', roles, () => 'x')).toBe('Usuario (LegiFirma)');
  });
  it('si no está, la del catálogo visual común', () => {
    expect(etiquetaRolApp('OFICIAL', roles, (k) => `común:${k}`)).toBe('común:OFICIAL');
  });
});
