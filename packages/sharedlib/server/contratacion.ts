/**
 * CONTRATACIÓN: qué aplicaciones tiene contratadas la organización del token.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────────
 *
 * Es la otra mitad de `audiencia.ts`, y la misma historia. `JWT_SECRET` es el
 * MISMO en todo el ecosistema, así que un token emitido al entrar en Notaría
 * verifica igual en Tramitación, Archivo o Pólizas: `jwtVerify` sólo comprueba
 * la firma. Lo único que impedía usar una app no contratada era el gate
 * `OrgApp` del **login** — una comprobación que ocurre en OTRO servicio y en
 * OTRO momento, y que no vuelve a mirarse cuando el token se presenta.
 *
 * Consecuencia, reportada por una usuaria el 28-sep-2026 (#898): entrando por
 * la página de Tramitación le salía «Tu organización no tiene acceso a esta
 * aplicación», pero entrando en Notaría y cambiando la dirección a la de
 * Tramitación, pasaba. El mismo usuario y la misma dirección funcionaban o no
 * según cómo llegara, y estuvo trabajando así hasta que se contrató la app.
 *
 * ── Cómo se comprueba ─────────────────────────────────────────────────────────
 *
 * El token trae la lista de apps activas de su organización (claim `apps`, que
 * estampa `signAccessToken`). No se consulta a auth en cada entrada: `org_apps`
 * vive en la base de datos de auth, no en la de las apps, así que preguntarlo
 * en vivo metería una llamada de red en el camino de cada petición y una
 * dependencia dura — si auth tose durante un despliegue, nadie entraría en
 * ninguna app. El desfase a cambio está acotado por la vida del access token
 * (`inactividad + 2` minutos, 17 por defecto): retirar o conceder una app tarda
 * como mucho eso en surtir efecto, que para una cuestión de contratación sobra.
 *
 * ── Lo que NO se hace, y por qué ──────────────────────────────────────────────
 *
 * Un token SIN el claim pasa. Podría parecer que eso deja el agujero abierto,
 * pero es justo al revés: sin esa tolerancia, el despliegue sería el problema.
 * Los tokens vivos emitidos antes de que auth estampe el claim dejarían fuera a
 * todo el mundo durante su vida útil, y cualquier orden de despliegue entre
 * auth y las apps se convertiría en un corte. Con ella, el orden da igual: en
 * cuanto auth va, todos los tokens traen el claim en 17 minutos y la frontera
 * empieza a morder sola. Un atacante no se beneficia: no puede fabricar un
 * token sin `JWT_SECRET`, y los que auth emite llevan el claim.
 */

/** Claims que mira esta frontera. `apps` lo estampa `signAccessToken`. */
export interface ClaimsContratacion {
  apps?: unknown;
  role?: unknown;
}

/**
 * Consolas de plataforma. No se conceden como `OrgApp` a nadie —su acceso lo
 * gatea cada una por rol (org_admin / superadmin)—, así que exigirles
 * contratación dejaría fuera a todo el mundo. Es la misma exención que hace el
 * login en `auth.service.ts`.
 */
const CONSOLAS = new Set(['config', 'admin']);

export class AppNoContratadaError extends Error {
  constructor(public readonly appSlug: string) {
    super('Tu organización no tiene acceso a esta aplicación');
    this.name = 'AppNoContratadaError';
  }
}

/** Las apps del claim, o `null` si el token no lo trae. */
function appsDelToken(claims: ClaimsContratacion): Set<string> | null {
  if (!Array.isArray(claims.apps)) return null;
  const slugs = claims.apps.filter((a): a is string => typeof a === 'string' && a.length > 0);
  return new Set(slugs);
}

/**
 * Rechaza el token si la organización no tiene contratada esta aplicación.
 *
 * Se llama en el mismo punto que `exigirAudiencia` —justo tras `jwtVerify`,
 * ANTES de resolver permisos o aprovisionar nada— porque es la misma pregunta
 * hecha en el mismo momento: si este token no pinta nada aquí, no debe llegar a
 * crear filas en `user_roles`.
 *
 * Un SUPERADMIN pasa siempre, como en el login: entra en cualquier app mire la
 * organización que mire, y es precisamente cuando algo va mal cuando más falta
 * le hace. La impersonación, en cambio, se comporta como el suplantado: su
 * token lleva las apps de la organización de destino.
 */
export function exigirAppContratada(claims: ClaimsContratacion, appSlug: string): void {
  if (CONSOLAS.has(appSlug)) return;
  if (claims.role === 'superadmin') return;
  const apps = appsDelToken(claims);
  if (apps === null) return; // token sin el claim: ver la cabecera
  if (!apps.has(appSlug)) throw new AppNoContratadaError(appSlug);
}
