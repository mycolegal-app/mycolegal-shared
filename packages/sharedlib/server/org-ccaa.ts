/**
 * #679 — Comunidad autónoma de una organización, cacheada por proceso.
 *
 * La CCAA la gobierna auth, pero las apps NO deben ir a preguntársela: auth es
 * para autenticar, y una consulta por cada expediente que se crea es carga que
 * no le corresponde. El dato se espeja en la fila de `organizations` de la
 * propia base de la app en cada login (ver `mirrorOrgAndRole`) y se lee de ahí.
 *
 * Y ni siquiera de ahí en cada uso: la comunidad de una notaría no cambia nunca
 * —y si cambia, es una corrección manual del superadmin— así que se guarda en
 * memoria del proceso con un TTL holgado. El coste de un dato viejo durante unos
 * minutos es nulo; el de consultarlo mil veces al día, no.
 *
 * Devuelve `null` cuando la org aún no tiene la comunidad espejada (nunca ha
 * entrado nadie desde una app que la copie). El llamador decide qué hacer con
 * eso; lo que NO debe es tratarlo como "península".
 */

interface OrganizationDelegate {
  findUnique(args: {
    where: { id: string };
    select: { comunidadAutonoma: true };
  }): Promise<{ comunidadAutonoma: string | null } | null>;
}

const TTL_MS = 30 * 60 * 1000;

// Por proceso. En Cloud Run cada instancia tiene la suya, que es justo lo que se
// quiere: sin coordinación, sin invalidación distribuida y sin nada que se
// quede pegado más de media hora.
const cache = new Map<string, { valor: string | null; expira: number }>();

export async function ccaaDeOrg(
  organizationDelegate: OrganizationDelegate,
  orgId: string,
): Promise<string | null> {
  const ahora = Date.now();
  const hit = cache.get(orgId);
  if (hit && hit.expira > ahora) return hit.valor;

  const org = await organizationDelegate.findUnique({
    where: { id: orgId },
    select: { comunidadAutonoma: true },
  });
  const valor = org?.comunidadAutonoma ?? null;
  cache.set(orgId, { valor, expira: ahora + TTL_MS });
  return valor;
}

/** Olvida lo cacheado de una org (o todo). Para cuando el superadmin la corrige. */
export function olvidarCcaaCacheada(orgId?: string): void {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
