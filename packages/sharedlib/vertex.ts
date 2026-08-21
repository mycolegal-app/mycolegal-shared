// Transporte compartido de Vertex AI (REST + ADC) para todos los servicios que
// hablan con Gemini/embeddings (Consultor, Platform…). Encapsula lo SUTIL que no
// debe divergir: autenticación (google-auth-library), el agente SIN keep-alive (fix
// del premature-close en Cloud Run vpc-egress), los reintentos con backoff y la
// construcción de la URL del modelo (incluida la regla gemini-3 → endpoint global,
// RGPD). Cada servicio pone ENCIMA sus wrappers de negocio (embeddings del RAG,
// prompts, créditos, OCR…) y su propia config (project/location por env).

import { Agent } from 'node:https';
import { GoogleAuth } from 'google-auth-library';

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
 * `client.request` con conexión nueva (sin keep-alive) + reintentos/backoff.
 * Reintenta ante 5xx/429 Y errores de red SIN `response` (`ERR_STREAM_PREMATURE_CLOSE`/
 * `ECONNRESET`). Un 4xx "real" (≠429) no se reintenta: no se arregla repitiendo.
 */
export async function vertexRequest<T>(
  config: Parameters<Awaited<ReturnType<GoogleAuth['getClient']>>['request']>[0],
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<{ data: T }> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const client = await getClient();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await client.request<T>({ ...config, agent: noKeepAliveAgent });
    } catch (err) {
      lastErr = err;
      const status = (err as { response?: { status?: number } })?.response?.status;
      const retriable = status === undefined || status >= 500 || status === 429;
      if (attempt === attempts || !retriable) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
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
