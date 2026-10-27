export type {
  AdminAuth,
  AdminRouteCtx,
  AdminHandler,
  AdminNextHandler,
  WithPermissionFn,
  SuccessFn,
  ErrorFn,
  FetchFromAuthFn,
  AdminPrisma,
  UserRolePrismaTable,
  AuditEvent,
  AuditFn,
  UsuariosRoutesDeps,
} from './types';

export {
  createUsuariosRoutes,
  createUsuariosByIdRoutes,
  createUsuariosInviteRoute,
  createUsuariosAppsCatalogRoute,
  createUsuariosByIdPermissionsRoute,
  createUsuariosByIdResendInvitationRoute,
  createUsuariosByIdProfileRoute,
  createUsuariosByIdSendPasswordResetRoute,
  createUsuariosByIdAuditRoute,
  createUsuariosCreateWithPasswordRoute,
  createUsuariosByIdAppPermRoute,
  createUsuariosAppPermsCatalogRoute,
} from './usuarios-routes';

// #1045 — fuente de datos de la sección «Roles y permisos de MycoLegal» del manual.
export { createManualRolesMatrixRoute } from './manual-roles-route';
export type { ManualRolesMatrixDeps } from './manual-roles-route';
