/**
 * #1045 — /api/manual/roles-matrix — GET
 *
 * Fuente de datos de la sección «Roles y permisos de MycoLegal» del manual
 * (`RolesMatrixSection` de `@mycolegal-app/ui/components/manual`). Passthrough a
 * auth `GET /roles-catalog/apps-matrix?scope=org|all`: roles y permisos que
 * declara cada app, con su etiqueta legible, grupo y si son reservados.
 *
 * A diferencia de `/api/admin/usuarios/apps-catalog` (que exige `admin:users`),
 * esto lo puede leer cualquier usuario con sesión: el manual lo lee todo el
 * personal y son datos de producto, no de personas. Sin sesión → 401 y el
 * componente pinta su aviso de «no se pudo cargar».
 *
 * Cada app lo monta con una línea:
 *   // src/app/api/manual/roles-matrix/route.ts
 *   export const { GET } = createManualRolesMatrixRoute(adminDeps);
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import type { UsuariosRoutesDeps } from './types';

export type ManualRolesMatrixDeps = Pick<
  UsuariosRoutesDeps,
  'successResponse' | 'errorResponse' | 'fetchFromAuth' | 'jwtCookieName'
>;

export function createManualRolesMatrixRoute(deps: ManualRolesMatrixDeps) {
  const { successResponse, errorResponse, fetchFromAuth, jwtCookieName } = deps;

  async function GET(req: NextRequest) {
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

      const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'org';
      const res = await fetchFromAuth(`/roles-catalog/apps-matrix?scope=${scope}`, token);
      if (res.status >= 400) {
        const msg = res.data?.error?.message || res.data?.error || 'Error al cargar los roles';
        return errorResponse('AUTH_ERROR', String(msg), res.status);
      }
      const data = res.data?.data ?? res.data ?? {};
      return successResponse({
        scope: data.scope ?? scope,
        apps: Array.isArray(data.apps) ? data.apps : [],
        roleCatalog: Array.isArray(data.roleCatalog) ? data.roleCatalog : [],
      });
    } catch (error) {
      console.error('[manual/roles-matrix] GET error:', error);
      return errorResponse('INTERNAL_ERROR', 'Error al cargar los roles', 500);
    }
  }

  return { GET };
}
