import { describe, it, expect } from 'vitest';
import { appRoleFields } from './usuarios-routes';

/**
 * #1045 — La columna «Rol» del panel de usuarios debe mostrar el rol de la app
 * según auth, no la fila local `user_roles.role`.
 */
describe('appRoleFields', () => {
  it('con rol del catálogo: su clave y sus permisos', () => {
    expect(
      appRoleFields({ appPermission: { appRoleKey: 'USUARIO_NOTARIA', permissions: ['a'] } }, false),
    ).toEqual({ appRoleKey: 'USUARIO_NOTARIA', appPermissions: ['a'] });
  });

  it('a medida: appRoleKey null y los permisos sueltos', () => {
    expect(
      appRoleFields({ appPermission: { appRoleKey: null, permissions: ['a', 'b'] } }, false),
    ).toEqual({ appRoleKey: null, appPermissions: ['a', 'b'] });
  });

  it('sin acceso: null y sin permisos', () => {
    expect(appRoleFields({ appPermission: null }, false)).toEqual({ appRoleKey: null, appPermissions: [] });
  });

  it('consolas de plataforma (admin/config): no se informa, la UI usa el rol de org', () => {
    expect(appRoleFields({ appPermission: null }, true)).toEqual({});
  });
});
