/**
 * AUDIENCIA del token: qué apps acepta cada identidad.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────────
 *
 * `JWT_SECRET` es el MISMO en todo el ecosistema. Un token emitido para el
 * Portal de Peticiones verifica igual en Notaría, Tramitación, Legifirma o Web:
 * `jwtVerify` sólo comprueba la firma. Hasta ahora lo único que separaba a un
 * externo de las apps internas era el gate `OrgApp` del **login** — es decir,
 * una comprobación que ocurre en OTRO servicio y en OTRO momento, y que no
 * vuelve a mirarse cuando el token se presenta.
 *
 * Peor: si un externo alcanzara una app interna, varias caen a un mapa ESTÁTICO
 * de permisos por rol cuando la resolución centralizada viene vacía, así que no
 * se quedaría en cero permisos — se quedaría con los del rol por defecto.
 *
 * Esto mueve la separación al punto de VERIFICACIÓN, que es donde tiene efecto.
 *
 * ── La línea ──────────────────────────────────────────────────────────────────
 *
 *   interna → personal de una notaría (`NOTARIA`) y colaboradores del proyecto
 *             (`COLABORADOR`, #597: administrada por el superadmin, población
 *             propia aunque no sea de ninguna notaría).
 *   externa → terceros que llegan por el Portal: gestorías, asesorías, bancos y
 *             clientes particulares.
 *
 * No es "NOTARIA contra el resto". `COLABORADOR` no es un tercero: su gente usa
 * Consultor como cualquier usuario interno, y clasificarla como externa la
 * dejaría fuera de la única app que usa.
 */

export type Audiencia = 'internal' | 'external';

/**
 * Los claims tal y como los devuelve `jose`: `aud` puede venir como lista,
 * porque el estándar JWT admite varias audiencias. Nosotros estampamos una sola,
 * pero el tipo tiene que admitir la forma general — si no, cada app tendría que
 * castear, y un cast en el punto donde se decide quién entra es justo donde no
 * se quiere uno.
 */
export interface ClaimsAudiencia {
  orgType?: unknown;
  aud?: string | string[] | null;
  role?: unknown;
}

/** Normaliza `aud` a una cadena: de una lista se toma la primera. */
function audClaim(aud: string | string[] | null | undefined): string | null {
  if (Array.isArray(aud)) return aud[0] ?? null;
  return aud ?? null;
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Tipos de organización cuya gente es TERCERA respecto de la plataforma. */
const TIPOS_EXTERNOS = new Set(['GESTORIA', 'ASESOR', 'BANCO', 'INTERESADO']);

/**
 * Audiencia de una identidad. Se deriva de `orgType` y no se toma del claim
 * `aud` a ciegas: así el resultado es el mismo para tokens antiguos (emitidos
 * antes de que `aud` existiera) y para los nuevos.
 *
 * Sin `orgType` → interna. Es el comportamiento previo, y no abre nada: los
 * externos SIEMPRE traen `orgType`. Tratar la ausencia como externa dejaría
 * fuera a tokens internos legítimos durante el despliegue.
 */
export function audienciaDe(claims: ClaimsAudiencia): Audiencia {
  const orgType = texto(claims.orgType);
  const role = texto(claims.role);
  // Un SUPERADMIN es interno mire la organización que mire. Sin esta línea, un
  // superadmin que selecciona la org de una gestoría —o la pool de clientes—
  // recibiría `orgType` externo y se quedaría fuera de Admin y de todo lo demás,
  // que es justo cuando más falta le hace entrar.
  //
  // La IMPERSONACIÓN es el caso contrario y sale bien sola: al suplantar, el
  // token lleva el `role` del suplantado, así que un superadmin actuando como
  // gestoría es EXTERNO — y debe serlo, porque el sentido de suplantar es ver
  // exactamente lo que ve esa persona.
  if (role === 'superadmin') return 'internal';
  if (orgType) return TIPOS_EXTERNOS.has(orgType) ? 'external' : 'internal';
  return audClaim(claims.aud) === 'external' ? 'external' : 'internal';
}

export class AudienciaNoAdmitidaError extends Error {
  constructor(public readonly appSlug: string, public readonly audiencia: Audiencia) {
    super(`Esta aplicación no admite identidades de tipo "${audiencia}"`);
    this.name = 'AudienciaNoAdmitidaError';
  }
}

/**
 * Rechaza el token si su audiencia no está entre las que admite la app.
 *
 * Se llama justo después de `jwtVerify`, ANTES de resolver permisos o de
 * aprovisionar nada: una identidad que no pinta nada en esta app no debe llegar
 * a crear filas en `user_roles`.
 *
 * @example
 *   const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
 *   exigirAudiencia(payload, ['internal'], 'notaria');
 */
export function exigirAudiencia(
  claims: ClaimsAudiencia,
  admitidas: readonly Audiencia[],
  appSlug: string,
): Audiencia {
  const audiencia = audienciaDe(claims);
  if (!admitidas.includes(audiencia)) {
    throw new AudienciaNoAdmitidaError(appSlug, audiencia);
  }
  return audiencia;
}

/** Atajo para la inmensa mayoría de apps: sólo identidad interna. */
export const SOLO_INTERNA: readonly Audiencia[] = ['internal'];

/**
 * Los PORTALES. Hoy son dos y sólo dos, y la lista es corta a propósito: cada
 * app aquí es una superficie más que auditar.
 *
 *   · `peticiones`       — portal de gestorías, bancos y clientes particulares.
 *   · `cancelaciones-bs` — portal de Banco Sabadell (decisión, 31-ago-2026).
 */
export const INTERNA_Y_EXTERNA: readonly Audiencia[] = ['internal', 'external'];
