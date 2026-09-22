/**
 * Dónde se invoca CADA modelo: (host, location, provider, verbo), decidido por el
 * catálogo `ai_models` (dueña: platform), NO por el nombre del modelo.
 *
 * Por qué importa: "soportado en la UE" no es un flag deducible del id. Los
 * Gemini 2.5 viven en `europe-west4`, los 3.x-flash con residencia UE en la
 * multi-región `eu` (`aiplatform.eu.rep.googleapis.com`) y algún 3.x-pro solo
 * existe en `global`, SIN residencia. Rutear por nombre —como hacía la regla
 * heredada `gemini-3* → global`— manda a un 3.x-flash fuera de la UE en silencio,
 * aunque el catálogo diga lo contrario. Eso ocurrió de verdad en la app `web`.
 *
 * Este módulo existía copiado en cinco aplicaciones. Aquí va una sola vez; el
 * cliente de Prisma entra por inyección (cada app tiene el suyo, con su propio
 * espejo del esquema canónico), igual que en `createCreditsClient`.
 */

export type Provider = 'google' | 'anthropic';

export interface ModelEndpoint {
  host: string;
  location: string;
  provider: Provider;
  verb: string;
}

/** Lo mínimo que se necesita del cliente Prisma de la app consumidora. */
export interface CatalogoModelos {
  aiModel: {
    findUnique(args: { where: { modelId: string } }): Promise<{
      host: string;
      location: string;
      provider: string;
      verb: string;
      available: boolean;
    } | null>;
  };
}

export interface ModelEndpointConfig {
  prisma: CatalogoModelos;
  /** Región por defecto para los modelos que no están en el catálogo. */
  defaultLocation?: string;
  /**
   * Reserva a medida para los modelos ausentes del catálogo. Lo usa platform,
   * que es la dueña del catálogo y deriva host/provider/verbo de su propia
   * lógica de sondeo — la misma con la que puebla la tabla.
   */
  fallback?: (model: string) => ModelEndpoint;
}

const CACHE_MS = 60_000;

export function createModelEndpointResolver(config: ModelEndpointConfig) {
  const defaultLocation = config.defaultLocation || process.env.GCP_LOCATION || 'europe-west4';
  const cache = new Map<string, { valor: ModelEndpoint; expira: number }>();

  /**
   * Reserva si el modelo no está en el catálogo. Heurística por nombre, que es
   * justo lo que este módulo evita — por eso solo se usa cuando no hay catálogo
   * que consultar, y mantiene la regla conservadora conocida para cada familia.
   */
  function fallbackPorDefecto(model: string): ModelEndpoint {
    const provider: Provider = model.startsWith('claude') ? 'anthropic' : 'google';
    const verb = provider === 'anthropic' ? 'rawPredict' : 'generateContent';
    if (provider === 'anthropic') {
      return { host: 'aiplatform.eu.rep.googleapis.com', location: 'eu', provider, verb };
    }
    if (model.startsWith('gemini-3')) {
      return { host: 'aiplatform.googleapis.com', location: 'global', provider, verb };
    }
    return { host: `${defaultLocation}-aiplatform.googleapis.com`, location: defaultLocation, provider, verb };
  }

  async function endpointDeModelo(model: string): Promise<ModelEndpoint> {
    const hit = cache.get(model);
    if (hit && hit.expira > Date.now()) return hit.valor;

    let valor = (config.fallback ?? fallbackPorDefecto)(model);
    try {
      const row = await config.prisma.aiModel.findUnique({ where: { modelId: model } });
      if (row?.available) {
        valor = { host: row.host, location: row.location, provider: row.provider as Provider, verb: row.verb };
      }
    } catch {
      // Catálogo sin migrar en esta app: seguimos con la heurística de reserva.
    }

    cache.set(model, { valor, expira: Date.now() + CACHE_MS });
    return valor;
  }

  /** URL REST, genérica por provider: `publishers/<provider>/models/<model>:<verbo>`. */
  function llmModelUrl(project: string, model: string, ep: ModelEndpoint): string {
    return `https://${ep.host}/v1/projects/${project}/locations/${ep.location}/publishers/${ep.provider}/models/${model}:${ep.verb}`;
  }

  /** URL ya resuelta, en un paso. */
  async function urlDeModelo(project: string, model: string): Promise<string> {
    return llmModelUrl(project, model, await endpointDeModelo(model));
  }

  /**
   * URL para llamadas que usan features SOLO de Gemini (multimodal `inlineData`,
   * context caching, `functionDeclarations`, `responseSchema`). Rutea por catálogo
   * pero EXIGE provider google: fallar claro es mejor que un 400 opaco de Vertex
   * si alguien asigna un Claude a esa tarea desde Admin.
   */
  async function geminiOnlyUrl(project: string, model: string): Promise<string> {
    const ep = await endpointDeModelo(model);
    if (ep.provider !== 'google') {
      throw new Error(`El modelo ${model} (${ep.provider}) no es válido para esta tarea: requiere un modelo Gemini.`);
    }
    return llmModelUrl(project, model, ep);
  }

  return { endpointDeModelo, llmModelUrl, urlDeModelo, geminiOnlyUrl };
}
