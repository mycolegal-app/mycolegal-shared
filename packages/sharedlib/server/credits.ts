import { NextResponse, type NextRequest } from 'next/server';
import { runWithUsageScope, collectedUsage, type UsoAcumulado } from './llm-usage';

/**
 * Cliente y proxy del monedero de créditos de IA (owner: mycolegal-platform).
 *
 * Dos piezas:
 *  - `createCreditsClient`: helper server-side `withCredits(...)` que envuelve
 *    TODA llamada de IA → precheck (bloqueo barato) → ejecuta la llamada →
 *    consume (liquida el coste con los tokens reales). Lo usan las API routes de
 *    cada app que invocan IA.
 *  - `createCreditsRoutes`: proxy `/api/credits/balance` para que la UI pinte el
 *    saldo del monedero. Fuerza el orgId de la sesión (un usuario solo ve su org).
 *
 * Igual que billing, platform vive detrás de X-Service-Key: NO se reenvía el JWT.
 */

export class InsufficientCreditsError extends Error {
  constructor(public balance: number) {
    super('Sin créditos de IA suficientes');
    this.name = 'InsufficientCreditsError';
  }
}

export interface CreditsClientConfig {
  /** Base URL interna de mycolegal-platform. */
  platformUrl: string;
  /** X-Service-Key (APPS_REGISTER_SECRET). */
  serviceKey: string;
  /** appSlug de quien consume (atribución por app en el libro mayor). */
  app: string;
}

export interface Usage {
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** Multiplicador del precio FIJO (acciones `fixed`); p.ej. el suplemento del
   *  Revisor cobra N veces la acción de 1 crédito. Ignorado en modo tokens. */
  quantity?: number | null;
}

export interface Quote {
  /** Créditos SIN redondear; `null` si el modelo no tiene tarifa activa. */
  credits: number | null;
  creditsPerInputToken: number | null;
  creditsPerOutputToken: number | null;
}

export interface WithCreditsCtx {
  orgId: string;
  actionKey: string;
  userId?: string | null;
  /**
   * Callback opcional con los créditos REALMENTE cobrados (según la tarifa vigente
   * del catálogo, que el Superadmin fija en Admin). Útil para persistir el coste
   * real de la acción. No se envía a `consume` (se retira del cuerpo).
   */
  onCharged?: (creditsCharged: number) => void;
}

/**
 * Funde lo que declara el llamante con lo que anotó el transporte.
 *
 * El llamante manda campo a campo: si pasa tokens explícitos es porque sabe algo
 * que el transporte no (un proveedor que no pasa por él, o un reparto propio del
 * coste). Lo que no declare se rellena con lo acumulado, que es el caso normal.
 */
function fundirUso(declarado: Usage | undefined, recogido: UsoAcumulado | undefined): Usage {
  return {
    model: declarado?.model ?? recogido?.model ?? null,
    tokensIn: declarado?.tokensIn ?? recogido?.tokensIn ?? null,
    tokensOut: declarado?.tokensOut ?? recogido?.tokensOut ?? null,
    ...(declarado?.quantity != null ? { quantity: declarado.quantity } : {}),
  };
}

export function createCreditsClient(config: CreditsClientConfig) {
  const base = config.platformUrl.replace(/\/$/, '');

  async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${base}/internal/credits/${path}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(`credits/${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  async function precheck(orgId: string): Promise<{ balance: number; blocked: boolean }> {
    return call('precheck', { method: 'POST', body: { orgId } });
  }

  async function consume(
    input: WithCreditsCtx & Usage,
  ): Promise<{ creditsCharged: number; balanceAfter: number; blocked: boolean }> {
    return call('consume', { method: 'POST', body: { ...input, app: config.app } });
  }

  async function getBalance(orgId: string) {
    return call(`balance?orgId=${encodeURIComponent(orgId)}`, { method: 'GET' });
  }

  /** Catálogo de acciones medidas (todas las apps) con su tarifa vigente. */
  async function listActions(): Promise<{ app: string; key: string; label: string; meterMode: string; fixedCredits: number }[]> {
    const r = await call<{ data?: { app: string; key: string; label: string; meterMode: string; fixedCredits: number }[] }>('metered-actions', { method: 'GET' });
    return r.data ?? [];
  }

  /** Cotiza (sin cargo) un consumo de tokens con la tarifa vigente del modelo. */
  async function quote(input: { model: string; tokensIn?: number | null; tokensOut?: number | null }): Promise<Quote> {
    return call('quote', { method: 'POST', body: input });
  }

  /**
   * Envuelve una llamada de IA cobrando créditos: bloquea ANTES si no hay saldo
   * (descubierto de cortesía incluido), ejecuta `fn`, y liquida DESPUÉS con los
   * tokens reales. El cargo es best-effort: si la liquidación falla, la operación
   * NO se rompe (la llamada de IA ya se hizo); se registra.
   *
   * **Los tokens ya NO hay que pasarlos a mano.** `fn` se ejecuta dentro de un
   * ámbito de contabilidad: el transporte compartido de Vertex anota cada llamada
   * al modelo, y aquí se recoge el total. `usage` sigue aceptándose y tiene
   * PRIORIDAD campo a campo, para los casos en que el llamante sabe algo que el
   * transporte no (p.ej. `quantity`, o un proveedor que no pase por ese
   * transporte). Lo que desaparece es la obligación de acordarse.
   *
   * Registrar tokens NO cambia lo que se cobra: el modo de cobro lo decide
   * `meterMode` en el catálogo de acciones (fixed vs tokens). En las acciones de
   * precio fijo los tokens se guardan solo como medida del coste real.
   */
  async function withCredits<T>(
    ctx: WithCreditsCtx,
    fn: () => Promise<{ value: T; usage?: Usage }>,
  ): Promise<T> {
    const pre = await precheck(ctx.orgId);
    if (pre.blocked) throw new InsufficientCreditsError(pre.balance);

    const { value, usage } = await runWithUsageScope(async () => {
      const r = await fn();
      // Se recoge DENTRO del ámbito: fuera ya se ha cerrado.
      return { ...r, recogido: collectedUsage() };
    }).then((r) => ({
      value: r.value,
      usage: fundirUso(r.usage, r.recogido),
    }));

    // Una acción de IA que se liquida sin un solo token es, casi siempre, una
    // función nueva que nadie instrumentó: el coste real se pierde y no vuelve.
    // Que deje rastro es la única forma de enterarse sin auditar el libro entero.
    if (!usage.tokensIn && !usage.tokensOut) {
      console.warn('[credits] acción de IA liquidada SIN tokens: el coste real no queda medido', {
        app: config.app,
        actionKey: ctx.actionKey,
      });
    }

    const { onCharged, ...meterCtx } = ctx;
    try {
      const res = await consume({ ...meterCtx, ...usage });
      onCharged?.(res.creditsCharged);
    } catch (err) {
      // Contabilidad best-effort: no romper la operación del usuario.
      console.error('[credits] consume failed', { actionKey: ctx.actionKey, err });
    }
    return value;
  }

  /**
   * Envuelve una función de IA **gratuita para el cliente**: anota lo que ha
   * consumido y NO cobra nada.
   *
   * Medir y cobrar son cosas distintas. Que una función sea gratis no la hace
   * gratuita para la plataforma: el proveedor nos cobra igual, y si ese consumo
   * no queda anotado, la rentabilidad del cliente sale falseada al alza — un
   * cliente que solo usa lo gratuito aparece como el más rentable de todos.
   *
   * Diferencias con `withCredits`: no hay `precheck` (bloquear por saldo una
   * función gratuita no tiene sentido) y el apunte va con coste cero. Por lo
   * demás es el mismo camino: el ámbito de contabilidad recoge los tokens solo.
   *
   * La acción debe estar catalogada con `meterMode = 'none'`; así el Superadmin
   * puede convertirla en cobrada desde Admin sin tocar código.
   */
  async function withUsage<T>(
    ctx: Omit<WithCreditsCtx, 'onCharged'>,
    fn: () => Promise<{ value: T; usage?: Usage }>,
  ): Promise<T> {
    const { value, usage } = await runWithUsageScope(async () => {
      const r = await fn();
      return { ...r, recogido: collectedUsage() };
    }).then((r) => ({ value: r.value, usage: fundirUso(r.usage, r.recogido) }));

    try {
      await consume({ ...ctx, ...usage });
    } catch (err) {
      // Medir nunca debe romper la operación del usuario.
      console.error('[credits] no se pudo anotar el uso', { actionKey: ctx.actionKey, err });
    }
    return value;
  }

  return { precheck, consume, getBalance, quote, listActions, withCredits, withUsage };
}

// --- Proxy de saldo para la UI (GET /api/credits/balance) -------------------

export interface CreditsRoutesConfig {
  platformUrl: string;
  serviceKey: string;
  /** withSession/withAuth de la app: rellena context.auth (orgId + rol/permisos). */
  withAuth: (handler: CreditsHandler) => CreditsHandler;
}

// El proxy recibe el AuthContext completo de la app (orgId + rol cross-app +
// permisos). Tipamos solo lo que usamos; en runtime la app inyecta el resto.
type CreditsAuth = { orgId: string; authRole?: string; permissions?: string[] };
type CreditsContext = { params: Promise<{ path?: string[] }>; auth: CreditsAuth };
type CreditsHandler = (request: NextRequest, context: CreditsContext) => Promise<Response>;

/**
 * ¿El usuario puede administrar la org (y por tanto comprar créditos)? Mismo
 * criterio que el hook `useIsOrgAdmin` del cliente: rol cross-app org_admin/
 * superadmin, o permiso de administración de usuarios / comodín. Sirve para
 * gatear las escrituras de forma uniforme SIN depender del catálogo de permisos
 * de cada app (evita el drift `billing:write` app-a-app).
 */
function canManageBilling(auth: CreditsAuth): boolean {
  const role = auth.authRole;
  const perms = auth.permissions ?? [];
  return (
    role === 'org_admin' ||
    role === 'superadmin' ||
    perms.includes('admin:users') ||
    perms.includes('admin:*') ||
    perms.includes('*')
  );
}

export function createCreditsRoutes(config: CreditsRoutesConfig) {
  const base = config.platformUrl.replace(/\/$/, '');

  // Lecturas (cualquier usuario de la org): saldo del monedero y catálogo de packs.
  // El saldo se pinta en la cabecera de todas las apps; los packs son catálogo
  // (nombre/precio), no dato sensible.
  const GET = config.withAuth(async (_request, context) => {
    const orgId = context.auth.orgId;
    const op = (await context.params).path?.[0] ?? 'balance';
    const path =
      op === 'balance'
        ? '/internal/credits/balance'
        : op === 'packs'
          ? '/internal/billing/packs'
          : null;
    if (!path) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const res = await fetch(`${base}${path}?orgId=${encodeURIComponent(orgId)}`, {
      headers: { 'X-Service-Key': config.serviceKey },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  });

  // Escrituras (SOLO org_admin): iniciar la compra de un pack. Se valida el rol
  // en el propio proxy (403 si no). `orgId` SIEMPRE de la sesión, nunca del
  // cuerpo del cliente.
  const POST = config.withAuth(async (request, context) => {
    if (!canManageBilling(context.auth)) {
      return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
    }
    const orgId = context.auth.orgId;
    const op = (await context.params).path?.[0];
    const target =
      op === 'checkout'
        ? '/internal/billing/credit-checkout'
        : op === 'purchase'
          ? '/internal/billing/credit-purchase'
          : null;
    if (!target) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const res = await fetch(`${base}${target}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: JSON.stringify({ ...body, orgId }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  });

  return { catchAll: { GET, POST } };
}
