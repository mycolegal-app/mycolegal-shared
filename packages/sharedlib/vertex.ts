// Transporte compartido de Vertex AI (REST + ADC) para todos los servicios que
// hablan con Gemini/embeddings (Consultor, Platform…). Encapsula lo SUTIL que no
// debe divergir: autenticación (google-auth-library), el agente SIN keep-alive (fix
// del premature-close en Cloud Run vpc-egress), los reintentos con backoff y la
// construcción de la URL del modelo (incluida la regla gemini-3 → endpoint global,
// RGPD). Cada servicio pone ENCIMA sus wrappers de negocio (embeddings del RAG,
// prompts, créditos, OCR…) y su propia config (project/location por env).

import { Agent } from 'node:https';
import { GoogleAuth } from 'google-auth-library';
import { recordLlmCall } from './server/llm-usage';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
let cachedClient: Awaited<ReturnType<GoogleAuth['getClient']>> | null = null;
async function getClient() {
  if (!cachedClient) cachedClient = await auth.getClient();
  return cachedClient;
}

// Agente SIN keep-alive: una conexión nueva por petición (como `curl`). CRÍTICO —
// con el keep-alive por defecto de gaxios, la NAT/GFE de salida de Cloud Run
// (`vpc-egress=all-traffic`) cierra el socket TCP ocioso y la siguiente llamada lo
// reutiliza → `ERR_STREAM_PREMATURE_CLOSE` en el 100% de las llamadas de un servicio
// de bajo tráfico. El coste de TLS por llamada es irrelevante aquí.
const noKeepAliveAgent = new Agent({ keepAlive: false });

export interface VertexModelConfig {
  project: string;
  location: string;
}

/** Región del modelo. Regla RGPD: `gemini-3*` solo existe en el endpoint GLOBAL. */
export function vertexLocationFor(model: string, defaultLocation: string): string {
  return model.startsWith('gemini-3') ? 'global' : defaultLocation;
}

/** Host REST según la región (`global` va sin prefijo). */
export function vertexHost(location: string): string {
  return location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
}

/** URL REST del modelo (con la regla gemini-3→global embebida). */
export function vertexModelUrl(model: string, verb: string, cfg: VertexModelConfig): string {
  const loc = vertexLocationFor(model, cfg.location);
  return `https://${vertexHost(loc)}/v1/projects/${cfg.project}/locations/${loc}/publishers/google/models/${model}:${verb}`;
}

/**
 * Tokens consumidos por una respuesta, según el proveedor.
 *
 * Gemini (`:generateContent`) los devuelve en `usageMetadata`; Claude en formato
 * Messages (`:rawPredict`) en `usage`. Los embeddings (`:predict`) no reportan
 * ninguno. Devuelve ceros si la respuesta no trae contabilidad.
 */
export function vertexUsage(data: unknown): { tokensIn: number; tokensOut: number } {
  const d = data as {
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (d?.usageMetadata) {
    return {
      tokensIn: d.usageMetadata.promptTokenCount ?? 0,
      tokensOut: d.usageMetadata.candidatesTokenCount ?? 0,
    };
  }
  if (d?.usage) {
    return { tokensIn: d.usage.input_tokens ?? 0, tokensOut: d.usage.output_tokens ?? 0 };
  }
  return { tokensIn: 0, tokensOut: 0 };
}

/** Id del modelo a partir de la URL REST (`…/models/<id>:<verbo>`). */
function modelDeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /\/models\/([^/:?]+)(?::|$)/.exec(url);
  return m ? m[1] : null;
}

/**
 * Techo por INTENTO cuando el llamante no pone el suyo. No es un número fino: es la
 * red que impide que una llamada se quede colgada para siempre (ver `vertexRequest`).
 * Los caminos con forma conocida —el chat, que debe caber en el timeout de Cloud
 * Run— pasan presupuestos mucho más cortos.
 */
const TIMEOUT_POR_INTENTO_MS = 120_000;

/** A partir de aquí una llamada que SÍ terminó bien se registra igualmente: es la
 *  cola de latencia del serving, y sin esta línea no se distingue de un cuelgue. */
const LENTA_MS = 30_000;

/**
 * `client.request` con conexión nueva (sin keep-alive) + reintentos/backoff.
 * Reintenta ante 5xx/429 Y errores de red SIN `response` (`ERR_STREAM_PREMATURE_CLOSE`/
 * `ECONNRESET`). Un 4xx "real" (≠429) no se reintenta: no se arregla repitiendo.
 *
 * ⚠️ TIMEOUT: hasta el 1-oct-2026 no había ninguno, y eso convertía la cola de
 * latencia del serving compartido de Vertex en cuelgues de minutos. Medido ese día
 * con la métrica del propio Vertex (`publisher/online_serving/model_invocation_latencies`,
 * `request_type: shared`): 44 de 438 invocaciones de `gemini-3.7-flash` por encima de
 * 30 s y dos por encima de 240 s —408 s para devolver 25-50 tokens—, mientras
 * `flash-lite` y los embeddings seguían en medio segundo. No es red nuestra ni CPU: es
 * capacidad compartida. Lo único que está en nuestra mano es no esperar indefinidamente
 * y reintentar, porque una petición NUEVA suele caer en capacidad sana.
 *
 * `deadlineMs` acota el TOTAL de la llamada (todos los intentos): sin él, 3 intentos de
 * `timeoutMs` pueden sumar más que el timeout de la request de Cloud Run (300 s) y el
 * usuario se come un 504 igual.
 *
 * Además ANOTA el consumo de cada respuesta en la contabilidad ambiental
 * (`server/llm-usage`), de modo que `withCredits` liquide con los tokens reales
 * sin que el punto de llamada tenga que pasarlos a mano. Fuera de un ámbito de
 * contabilidad abierto, anotar no hace nada.
 */
export async function vertexRequest<T>(
  config: Parameters<Awaited<ReturnType<GoogleAuth['getClient']>>['request']>[0],
  opts: {
    attempts?: number;
    baseDelayMs?: number;
    /** Techo de CADA intento (ms). Por defecto `TIMEOUT_POR_INTENTO_MS`. */
    timeoutMs?: number;
    /** Techo del conjunto intentos+esperas (ms). Sin él, solo manda `timeoutMs`. */
    deadlineMs?: number;
  } = {},
): Promise<{ data: T }> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_POR_INTENTO_MS;
  const client = await getClient();
  const model = modelDeUrl(typeof config.url === 'string' ? config.url : undefined);
  const t0 = Date.now();
  const restante = () => (opts.deadlineMs ? opts.deadlineMs - (Date.now() - t0) : Infinity);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const tIntento = Date.now();
    // El último intento aprovecha lo que quede de deadline aunque sea menos que
    // `timeoutMs`: mejor un intento corto que ninguno.
    const techo = Math.min(timeoutMs, Math.max(1, restante()));
    try {
      const res = await client.request<T>({ ...config, agent: noKeepAliveAgent, timeout: techo });
      if (model) recordLlmCall({ model, ...vertexUsage(res.data) });
      const ms = Date.now() - t0;
      if (attempt > 1 || ms > LENTA_MS) {
        console.warn('[vertex] llamada lenta', JSON.stringify({ model, intentos: attempt, ms, techo }));
      }
      return res;
    } catch (err) {
      lastErr = err;
      const status = (err as { response?: { status?: number } })?.response?.status;
      const code = (err as { code?: string })?.code;
      const retriable = status === undefined || status >= 500 || status === 429;
      const espera = baseDelayMs * attempt;
      const sinTiempo = restante() - espera <= 0;
      // El fallo de un intento ya NO es mudo: sin esta línea, dos reintentos de 120 s
      // y una generación lenta de 240 s se leen exactamente igual en los logs.
      console.warn(
        '[vertex] intento fallido',
        JSON.stringify({
          model,
          intento: attempt,
          de: attempts,
          ms: Date.now() - tIntento,
          status: status ?? null,
          code: code ?? null,
          reintenta: retriable && attempt < attempts && !sinTiempo,
        }),
      );
      if (attempt === attempts || !retriable || sinTiempo) throw err;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw lastErr;
}

/** Extrae el texto concatenado de la respuesta `generateContent` de Gemini. */
export function vertexText(data: {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}): string {
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}
