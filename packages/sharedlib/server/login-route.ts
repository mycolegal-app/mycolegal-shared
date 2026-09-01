/**
 * Ruta `POST /api/auth/login` compartida por todas las apps Next del ecosistema.
 *
 * Antes cada app tenía su propia copia (13 ficheros, 108–201 líneas, 4 variantes
 * derivadas del mismo original): cualquier cambio en el contrato del login obligaba
 * a tocar 13 repos y, si uno se olvidaba, esa app se comportaba distinto en silencio
 * — pasó al añadir el gate `REGISTRATION_INCOMPLETE`. Aquí vive el tronco común y
 * cada app aporta SOLO lo suyo: su slug, sus cookies, qué roles admite y cómo
 * materializa al usuario en su propia BD.
 *
 * Lo que hace, en orden:
 *  1. valida el cuerpo;
 *  2. delega en auth (`POST /auth/login`) con el `appSlug` de la app;
 *  3. reenvía tal cual los tres desenlaces que NO son sesión: gate de alta
 *     (403 REGISTRATION_INCOMPLETE, con su `completionUrl`), selección de org de
 *     superadmin, y cuenta pendiente de activación (202);
 *  4. aplica el filtro de roles de la app (consolas: admin → superadmin,
 *     config → administradores);
 *  5. ejecuta la provisión local de la app (org espejo + rol) si la hay;
 *  6. fija las cookies de sesión y siembra `mc_lang` desde el JWT.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { languageFromJwt, setLanguageCookie } from './language';
import { clientForwardHeaders } from './client-ip';

/** Usuario tal y como lo devuelve auth en el login. */
export interface LoginUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  orgId: string;
  orgSlug: string;
  orgName?: string | null;
  orgLogo?: string | null;
  /** #679 — Código INE de la comunidad autónoma, tal y como lo manda auth. */
  orgComunidadAutonoma?: string | null;
}

export interface LoginCookieConfig {
  /** Nombre de la cookie del access token (p.ej. `mycolegal-token`). */
  jwtName: string;
  /** Nombre de la cookie del refresh token. */
  refreshName: string;
  secure: boolean;
  /** Dominio compartido para SSO entre apps (`.mycolegal.app`). Vacío = host actual. */
  domain?: string;
  maxAge: number;
  refreshMaxAge: number;
}

export interface LoginProvisionContext {
  user: LoginUser;
  /** Access token recién emitido, por si la provisión necesita llamar a auth. */
  accessToken: string;
  authInternalUrl: string;
}

export interface LoginRouteOptions {
  /** URL interna del servicio auth. */
  authInternalUrl: string;
  /**
   * Slug con el que auth comprueba que la org tiene concedida ESTA app. Las
   * consolas de plataforma (`admin`, `config`) no son OrgApp: se dejan sin slug
   * y su acceso lo gatea `allowedRoles`.
   */
  appSlug?: string;
  cookies: LoginCookieConfig;
  /**
   * Roles de auth admitidos. Vacío/omitido = cualquiera. Se comprueba DESPUÉS de
   * que auth valide credenciales, así que devuelve 403 (no 401): las credenciales
   * eran buenas, lo que falla es el permiso.
   */
  allowedRoles?: readonly string[];
  /** Mensaje del 403 anterior. */
  forbiddenMessage?: string;
  /**
   * Materializa al usuario en la BD local de la app (org espejo + fila de rol).
   * Si lanza, la respuesta es 500 PROVISION_FAILED y NO se emiten cookies: una
   * sesión sin fila local acaba en pantallas rotas más adelante.
   */
  provision?: (ctx: LoginProvisionContext) => Promise<void>;
  /**
   * Sembrar la cookie `mc_lang` con el idioma del JWT. Por defecto sí; las
   * consolas sin i18n ([[admin]]) pasan `false`.
   */
  seedLanguageCookie?: boolean;
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function createLoginRoute(
  options: LoginRouteOptions,
): (request: NextRequest) => Promise<NextResponse> {
  const {
    authInternalUrl,
    appSlug,
    cookies,
    allowedRoles,
    forbiddenMessage = 'No tienes acceso a esta aplicación',
    provision,
    seedLanguageCookie = true,
  } = options;

  return async function POST(request: NextRequest): Promise<NextResponse> {
    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError('INVALID_BODY', 'Request body inválido', 400);
    }

    if (!body.email || !body.password) {
      return jsonError('VALIDATION_ERROR', 'Email y contraseña son obligatorios', 422);
    }

    let authResponse: Response;
    let authData: Record<string, any>;
    try {
      authResponse = await fetch(`${authInternalUrl}/auth/login`, {
        method: 'POST',
        // La IP real del cliente viaja hasta auth: su rate-limit del login es por
        // IP y sin esto todas las apps compartían un único cupo. Ver client-ip.ts.
        headers: { 'Content-Type': 'application/json', ...clientForwardHeaders(request) },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
          ...(appSlug ? { appSlug } : {}),
        }),
      });
      authData = await authResponse.json();
    } catch (err) {
      console.error('[login] auth no accesible:', err);
      return jsonError('AUTH_UNAVAILABLE', 'Servicio de autenticación no disponible', 502);
    }

    // Gate de alta: la notaría no ha completado su alta o se quedó sin método de
    // pago. Se reenvía ENTERO porque lleva a dónde mandarla (`completionUrl`) o a
    // quién debe reclamar (`adminEmail`); aplastarlo en `{error:{code,message}}`
    // dejaría al formulario sin destino.
    if (authData?.code === 'REGISTRATION_INCOMPLETE') {
      return NextResponse.json(authData, { status: authResponse.status });
    }

    if (!authResponse.ok) {
      const code = authData?.code || authData?.error?.code || 'AUTH_FAILED';
      const message =
        (typeof authData?.error === 'string' ? authData.error : authData?.error?.message) ||
        authData?.message ||
        'Credenciales inválidas';
      return NextResponse.json({ error: { code, message } }, { status: authResponse.status });
    }

    // Superadmin con varias orgs: el front pinta el selector y vuelve por
    // /api/auth/login/select-org.
    if (authData.requiresOrgSelection) return NextResponse.json(authData);

    // Usuario invitado que nunca activó: auth le reenvía el correo, no hay sesión.
    if (authResponse.status === 202 || authData.code === 'account_pending_activation') {
      return NextResponse.json(authData, { status: 202 });
    }

    const accessToken = authData.accessToken as string | undefined;
    const refreshToken = authData.refreshToken as string | undefined;
    const user = authData.user as LoginUser | undefined;

    if (!accessToken || !user) {
      return jsonError('AUTH_ERROR', 'No se recibió token de autenticación', 502);
    }

    if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
      return jsonError('FORBIDDEN', forbiddenMessage, 403);
    }

    if (provision) {
      try {
        await provision({ user, accessToken, authInternalUrl });
      } catch (err) {
        console.error('[login] Failed to provision local user role:', err);
        return jsonError(
          'PROVISION_FAILED',
          'No se pudo preparar el entorno local para tu sesión. Contacta con soporte.',
          500,
        );
      }
    }

    const response = NextResponse.json({
      data: { user, mustChangePassword: authData.mustChangePassword === true },
    });

    const cookieBase = {
      httpOnly: true,
      secure: cookies.secure,
      sameSite: 'lax' as const,
      path: '/',
      ...(cookies.domain ? { domain: cookies.domain } : {}),
    };

    response.cookies.set(cookies.jwtName, accessToken, { ...cookieBase, maxAge: cookies.maxAge });
    if (refreshToken) {
      response.cookies.set(cookies.refreshName, refreshToken, {
        ...cookieBase,
        maxAge: cookies.refreshMaxAge,
      });
    }

    // `mc_lang` con el idioma del JWT recién emitido, sobrescribiendo el previo:
    // el layout lee la cookie sin decodificar el JWT en cada render.
    if (seedLanguageCookie) {
      const lang = languageFromJwt(accessToken);
      if (lang) setLanguageCookie(response, lang, { secure: cookies.secure, domain: cookies.domain });
    }

    return response;
  };
}

// ---------------------------------------------------------------------------
// Provisión local estándar (la que comparten las apps de negocio)
// ---------------------------------------------------------------------------

/** Delegate mínimo de `prisma.organization` (la sombra local de la org de auth). */
export interface OrganizationMirrorDelegate {
  updateMany(args: {
    where: { slug: string; id: { not: string } };
    data: { slug: string };
  }): Promise<{ count: number }>;
  upsert(args: {
    where: { id: string };
    update: { slug: string } & Record<string, unknown>;
    create: { id: string; name: string; slug: string } & Record<string, unknown>;
  }): Promise<unknown>;
}

/** Delegate mínimo de la tabla de roles local (`userRole`, `consultorUserRole`…). */
export interface AppUserRoleDelegate<TRole extends string> {
  upsert(args: {
    where: { authUserId_orgId: { authUserId: string; orgId: string } };
    update: Record<string, unknown>;
    create: {
      authUserId: string;
      orgId: string;
      role: TRole;
      active: boolean;
      displayName: string;
      email: string;
    };
  }): Promise<unknown>;
}

export interface MirrorOrgAndRoleOptions<TRole extends string> {
  organizationDelegate: OrganizationMirrorDelegate;
  userRoleDelegate: AppUserRoleDelegate<TRole>;
  /** authRole (`superadmin`/`org_admin`/`user`) → rol del enum local de la app. */
  roleMap: Record<string, TRole>;
  /** Rol por defecto cuando el authRole no está en el mapa. */
  defaultRole: TRole;
  /**
   * Pedir a auth el `appRoleKey` centralizado (catálogo B2B) y usarlo como rol si
   * es un valor válido del enum local. Consultor lo usa; el resto deriva el rol
   * efectivo en runtime y guarda el del mapa.
   */
  centralizedRoleApp?: string;
  /** Valores válidos del enum local; filtran un `appRoleKey` que no exista aquí. */
  validRoles?: readonly TRole[];
  /** Guardar el rol también en cada login (no solo al crear la fila). */
  updateRoleOnLogin?: boolean;
  /**
   * Traducción propia del `appRoleKey` centralizado al enum local, cuando el
   * catálogo global y el enum de la app no usan la misma nomenclatura (legifirma
   * tiene su `toLocalAppRole`). Sin esto se aplica la clave tal cual si es válida.
   */
  mapCentralizedRole?: (key: string | undefined, fallback: TRole) => TRole;
  /**
   * Campos extra para el upsert de la org espejo (entran tanto en `create` como
   * en `update`). Notaría lo usa para arrastrar la `comunidadAutonoma` que sirve
   * auth, que gobierna la jurisdicción por defecto de la app.
   */
  orgExtraData?: (ctx: LoginProvisionContext) => Promise<Record<string, unknown>>;
  /**
   * #679 — Copiar la comunidad autónoma que manda auth a la fila espejo de
   * `organizations`. Solo para apps cuyo esquema DECLARA la columna; en las
   * demás, Prisma no conoce el campo y el login fallaría. Por defecto `false`.
   */
  espejarComunidadAutonoma?: boolean;
  /**
   * Trabajo adicional una vez la org existe en local y ANTES de tocar el rol
   * (legifirma siembra ahí sus catálogos de aranceles). Si lanza, el login
   * devuelve PROVISION_FAILED como cualquier otro fallo de provisión.
   */
  afterOrg?: (ctx: LoginProvisionContext) => Promise<void>;
}

/**
 * Provisión estándar: refleja la org de auth en la BD local y materializa la fila
 * de rol del usuario. Es idéntica en las 11 apps de negocio salvo el enum y la
 * tabla, que entran como delegates genéricos (mismo truco que `provisionUserRole`).
 *
 * El `updateMany` previo NO es decorativo: si la BD de auth se resetea y la de la
 * app no (habitual en e2e), puede quedar otra org con el mismo slug bajo otro id y
 * el upsert violaría el índice único. Se le renombra el slug antes.
 */
export function mirrorOrgAndRole<TRole extends string>(
  options: MirrorOrgAndRoleOptions<TRole>,
): (ctx: LoginProvisionContext) => Promise<void> {
  const {
    organizationDelegate,
    userRoleDelegate,
    roleMap,
    defaultRole,
    centralizedRoleApp,
    validRoles,
    updateRoleOnLogin = false,
    mapCentralizedRole,
    orgExtraData,
    afterOrg,
    espejarComunidadAutonoma = false,
  } = options;

  return async (ctx) => {
    const { user, accessToken, authInternalUrl } = ctx;

    await organizationDelegate.updateMany({
      where: { slug: user.orgSlug, id: { not: user.orgId } },
      data: { slug: `${user.orgSlug}-orphan-${Date.now()}` },
    });

    const extra = orgExtraData ? await orgExtraData(ctx) : {};
    // #679 — La comunidad autónoma la gobierna auth y viaja YA en la respuesta
    // del login, así que se espeja aquí, para TODAS las apps y sin preguntarle
    // nada a auth. Antes solo lo hacía notaría —y con un fetch extra suyo—, de
    // modo que la fila la creaba la primera app en la que entrara el despacho y
    // si no era notaría nacía sin comunidad: 64 de 65 organizaciones la tenían
    // a NULL. La columna existía, tenía el nombre correcto y estaba vacía, que
    // es la peor forma de fallar.
    //
    // Solo se escribe si auth manda algo —un `undefined` no debe borrar lo que
    // ya hubiera espejado otra app— y solo si la app DECLARA la columna en su
    // subconjunto de esquema. Hoy la traen auth, consultor, notaría y platform;
    // en el resto, el cliente Prisma no conoce el campo y escribirlo reventaría
    // el login entero por un dato accesorio. Para sumar una app basta con
    // declarar `comunidadAutonoma` en su `Organization` y activar el flag: la
    // columna ya existe en la base, que es común.
    const ccaa =
      espejarComunidadAutonoma && user.orgComunidadAutonoma != null
        ? { comunidadAutonoma: user.orgComunidadAutonoma }
        : {};
    await organizationDelegate.upsert({
      where: { id: user.orgId },
      // El nombre lo gobierna auth (fuente de verdad): aquí NO se toca, o cada
      // login sobrescribiría el nombre real de la notaría con su slug.
      update: { slug: user.orgSlug, ...ccaa, ...extra },
      create: {
        id: user.orgId,
        name: user.orgName || user.orgSlug,
        slug: user.orgSlug,
        ...ccaa,
        ...extra,
      },
    });

    if (afterOrg) await afterOrg(ctx);

    const fallbackRole: TRole = roleMap[user.role] || defaultRole;
    let appRole: TRole = fallbackRole;
    let centralizedKey: string | undefined;

    if (centralizedRoleApp) {
      try {
        const res = await fetch(`${authInternalUrl}/auth/me/permissions/${centralizedRoleApp}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { data?: { appRoleKey?: string } };
          centralizedKey = data.data?.appRoleKey;
        }
      } catch {
        // Sin permisos centralizados se conserva el rol del mapa.
      }
      if (mapCentralizedRole) {
        appRole = mapCentralizedRole(centralizedKey, fallbackRole);
      } else if (centralizedKey) {
        // Un `appRoleKey` del catálogo global que el enum local no conoce haría
        // fallar el create y echaría al usuario al login: se ignora.
        const key = centralizedKey as TRole;
        if (!validRoles || validRoles.includes(key)) appRole = key;
      }
    }

    await userRoleDelegate.upsert({
      where: { authUserId_orgId: { authUserId: user.id, orgId: user.orgId } },
      update: {
        email: user.email,
        displayName: user.displayName,
        lastLoginAt: new Date(),
        ...(updateRoleOnLogin ? { role: appRole } : {}),
      },
      create: {
        authUserId: user.id,
        orgId: user.orgId,
        role: appRole,
        active: true,
        displayName: user.displayName,
        email: user.email,
      },
    });
  };
}
