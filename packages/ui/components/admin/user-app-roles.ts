/**
 * #1045 — Lógica pura del rol de un usuario por app en el panel de usuarios y
 * en el modal de permisos (separada para poder probarla sin pintar nada).
 *
 * Un grant de auth puede tener rol del catálogo (`appRoleKey`) o ser A MEDIDA
 * (`appRoleKey` null, permisos sueltos). El modal trataba el segundo caso como
 * «sin acceso»; al marcarlo aplicaba el rol por defecto y, al guardar, auth
 * sustituía los permisos a medida por los de ese rol. Aquí la fila a medida es
 * un valor más del selector (`ROL_A_MEDIDA`) que nunca se envía: sólo cambia si
 * el administrador elige otro rol a propósito.
 */

/** Valor del selector para «A medida» (Radix no admite valor vacío). */
export const ROL_A_MEDIDA = '__a_medida__';

export interface UserAppRolesInput {
  role?: string | null;
  hasAppAccess?: boolean;
  /** Rol de la app actual según auth; null = a medida; undefined = desconocido. */
  appRoleKey?: string | null;
  otherApps?: Array<{ slug: string; appRoleKey?: string | null }>;
}

/**
 * Estado inicial del modal: slug → clave de rol (o `ROL_A_MEDIDA`). Las apps
 * sin acceso no aparecen.
 */
export function rolesInicialesPorApp(
  user: UserAppRolesInput | null,
  currentAppSlug: string,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!user) return map;
  if (user.hasAppAccess) {
    if (user.appRoleKey !== undefined) {
      // Rol de ESTA app según auth (no la fila local `user_roles.role`).
      map.set(currentAppSlug, user.appRoleKey ?? ROL_A_MEDIDA);
    } else if (user.role) {
      // Sharedlib antiguo o auth caído: no hay otra cosa que el rol local.
      map.set(currentAppSlug, user.role);
    }
  }
  for (const app of user.otherApps ?? []) {
    // Cada entrada de `otherApps` es un grant existente: sin clave = a medida.
    map.set(app.slug, app.appRoleKey || ROL_A_MEDIDA);
  }
  return map;
}

/**
 * Diferencias a enviar al guardar. Una app que sigue «A medida» no se envía
 * (nada que cambiar); una que pasa de «A medida» a un rol sí, y sustituye sus
 * permisos (el modal lo avisa antes).
 */
export function cambiosDeRoles(
  inicial: Map<string, string>,
  actual: Map<string, string>,
): { grants: Array<{ slug: string; appRoleKey: string }>; removeApps: string[] } {
  const grants: Array<{ slug: string; appRoleKey: string }> = [];
  const removeApps: string[] = [];
  for (const [slug, role] of actual) {
    if (!role || role === ROL_A_MEDIDA) continue;
    if (inicial.get(slug) !== role) grants.push({ slug, appRoleKey: role });
  }
  for (const slug of inicial.keys()) {
    if (!actual.has(slug)) removeApps.push(slug);
  }
  return { grants, removeApps };
}

/** ¿Este cambio sustituye unos permisos a medida por los de un rol? */
export function sustituyeAMedida(
  inicial: Map<string, string>,
  actual: Map<string, string>,
  slug: string,
): boolean {
  const role = actual.get(slug);
  return inicial.get(slug) === ROL_A_MEDIDA && !!role && role !== ROL_A_MEDIDA;
}

/**
 * Etiqueta de un rol de app: la del catálogo de roles de esa app (auth) si la
 * hay; si no, la del catálogo visual común; si no, la clave.
 */
export function etiquetaRolApp(
  appRoleKey: string,
  rolesDeLaApp: ReadonlyArray<{ key: string; label: string }> | undefined,
  fallbackLabel: (key: string) => string,
): string {
  return rolesDeLaApp?.find((r) => r.key === appRoleKey)?.label ?? fallbackLabel(appRoleKey);
}
