/**
 * #1045 — Lógica pura de la matriz «rol × permiso» del manual («Roles y
 * permisos de MycoLegal»). Los datos salen de auth (`AppRole` + `AppPermission`
 * que cada app declara al registrarse) vía `/api/manual/roles-matrix`; aquí sólo
 * se ordenan y se cruzan para pintar la tabla. Sin React, para poder testearla.
 */

import { isLegacyHiddenRole } from '../components/admin/role-catalog';

export interface RolesMatrixPermission {
  key: string;
  label: string;
  group?: string | null;
  description?: string | null;
  /** No lo cubre el `*`: sólo lo concede un superadmin. */
  reserved?: boolean;
}

export interface RolesMatrixRole {
  key: string;
  label: string;
  description?: string | null;
  isDefault?: boolean;
  isAdminDefault?: boolean;
  permissions: string[];
}

export interface RolesMatrixApp {
  slug: string;
  name: string;
  roles: RolesMatrixRole[];
  permissions: RolesMatrixPermission[];
}

export interface RolesMatrixData {
  scope: 'org' | 'all';
  apps: RolesMatrixApp[];
  roleCatalog: Array<{ codigo: string; label: string; descripcion?: string | null }>;
}

export interface MatrixRow {
  key: string;
  label: string;
  description: string | null;
  reserved: boolean;
  /** Una celda por rol visible, en el mismo orden que `roles`. */
  cells: boolean[];
}

export interface MatrixGroup {
  group: string;
  rows: MatrixRow[];
}

export interface BuiltAppMatrix {
  roles: Array<RolesMatrixRole & { fullAccess: boolean }>;
  groups: MatrixGroup[];
}

/** Orden de presentación del catálogo unificado (#78); el resto, alfabético detrás. */
const ROLE_ORDER = [
  'ADMINISTRADOR_NOTARIA',
  'USUARIO_NOTARIA',
  'OBSERVADOR_NOTARIA',
  'CONTABLE_NOTARIA',
  'ADMINISTRADOR_BANCO',
  'USUARIO_BANCO',
  'VALIDADOR_BANCO',
];

const GENERAL_GROUP = 'General';

function rank(r: RolesMatrixRole): number {
  const i = ROLE_ORDER.indexOf(r.key);
  if (i >= 0) return i;
  return r.permissions.includes('*') ? ROLE_ORDER.length : ROLE_ORDER.length + 1;
}

/**
 * Roles que se documentan: los que hoy se asignan. Los legacy (NOTARIO,
 * OFICIAL, TRAMITADOR…) siguen en auth para cuentas antiguas pero el panel ya
 * no los ofrece; sólo se muestran si la app no tiene otros.
 */
export function visibleRoles(roles: RolesMatrixRole[]): RolesMatrixRole[] {
  const nuevos = roles.filter((r) => !isLegacyHiddenRole(r.key));
  const pool = nuevos.length ? nuevos : roles;
  return [...pool].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'es'));
}

/** ¿Tiene el rol este permiso? El `*` cubre todo salvo los reservados. */
export function roleHasPermission(role: RolesMatrixRole, perm: RolesMatrixPermission): boolean {
  if (role.permissions.includes(perm.key)) return true;
  return role.permissions.includes('*') && !perm.reserved;
}

export function buildAppMatrix(app: RolesMatrixApp): BuiltAppMatrix {
  const roles = visibleRoles(app.roles).map((r) => ({ ...r, fullAccess: r.permissions.includes('*') }));

  // Universo de permisos: los declarados + cualquier clave que un rol tenga sin
  // declarar (para no esconder nada; se muestran con su clave).
  const declared = new Map(app.permissions.map((p) => [p.key, p]));
  const perms: RolesMatrixPermission[] = [...app.permissions];
  for (const r of roles) {
    for (const k of r.permissions) {
      if (k === '*' || declared.has(k)) continue;
      const extra = { key: k, label: k, group: null, description: null, reserved: false };
      declared.set(k, extra);
      perms.push(extra);
    }
  }

  const groups = new Map<string, MatrixRow[]>();
  for (const p of perms) {
    const g = p.group?.trim() || GENERAL_GROUP;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({
      key: p.key,
      label: p.label || p.key,
      description: p.description ?? null,
      reserved: !!p.reserved,
      cells: roles.map((r) => roleHasPermission(r, p)),
    });
  }

  return { roles, groups: [...groups.entries()].map(([group, rows]) => ({ group, rows })) };
}

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Adaptador de respaldo: si la app aún no monta `/api/manual/roles-matrix`, el
 * manual prueba `/api/admin/usuarios/apps-catalog` (sólo responde a quien
 * gestiona usuarios). Ese endpoint trae los roles con sus claves de permiso pero
 * no el catálogo legible: se agrupan por el prefijo de la clave.
 */
export function fromAppsCatalog(payload: unknown): RolesMatrixData {
  const p = payload as { data?: { apps?: unknown[] }; apps?: unknown[] } | null;
  const apps = (p?.data?.apps ?? p?.apps ?? []) as Array<{
    slug: string;
    name: string;
    roles?: RolesMatrixRole[];
  }>;
  return {
    scope: 'org',
    roleCatalog: [],
    apps: apps.map((a) => {
      const roles = a.roles ?? [];
      const keys = new Set<string>();
      for (const r of roles) for (const k of r.permissions ?? []) if (k !== '*') keys.add(k);
      return {
        slug: a.slug,
        name: a.name,
        roles,
        permissions: [...keys].sort().map((k) => ({
          key: k,
          label: k,
          group: capitalizar(k.split(':')[0] ?? ''),
        })),
      };
    }),
  };
}

/** Normaliza la respuesta de `/api/manual/roles-matrix` (con o sin envoltorio `data`). */
export function parseRolesMatrix(payload: unknown): RolesMatrixData {
  const p = payload as { data?: Partial<RolesMatrixData> } & Partial<RolesMatrixData>;
  const d = (p?.data ?? p ?? {}) as Partial<RolesMatrixData>;
  return {
    scope: d.scope === 'all' ? 'all' : 'org',
    apps: Array.isArray(d.apps) ? d.apps : [],
    roleCatalog: Array.isArray(d.roleCatalog) ? d.roleCatalog : [],
  };
}
