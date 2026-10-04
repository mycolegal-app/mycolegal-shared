// EL CATÁLOGO DE PROMPTS — el mecanismo, no el contenido.
//
// Tres reglas, y las tres importan:
//
//   · el **DEFAULT lo manda el código**: se republica en cada arranque, así que
//     el texto que escribe quien programa es la verdad de partida;
//   · el **OVERRIDE lo manda Admin**: publicar NO lo toca, o cada despliegue
//     borraría lo que el SuperAdmin acaba de afinar;
//   · si la base falla, **se usa el texto del código**. Un problema de
//     configuración no puede dejar una llamada al modelo sin prompt.
//
// POR QUÉ SUBE EL MECANISMO Y NO EL CATÁLOGO
//
// El catálogo es contenido de cada app —los prompts de tramitación no le sirven
// a DocFilling— pero el mecanismo era idéntico: cargar overrides, caer al
// código, y publicar el catálogo en platform al arrancar. Eso es lo que estaba
// copiado.

/** Un prompt del catálogo, tal como lo escribe quien programa. */
export interface PromptDef {
  key: string;
  grupo: string;
  titulo: string;
  descripcion: string;
  texto: string;
}

/** Lo mínimo del Prisma de la app: leer los overrides vigentes. */
export interface CatalogoPrompts {
  aiPrompt: {
    findMany(args: { where: { app: string } }): Promise<{ promptKey: string; overridePrompt: string | null }[]>;
  };
}

export interface CatalogoPromptsConfig {
  prisma: CatalogoPrompts;
  app: string;
  catalogo: readonly PromptDef[];
  /** URL interna de platform. Vacía ⇒ no se publica (y se dice). */
  platformUrl?: string;
  serviceKey?: string;
  cacheMs?: number;
}

export interface ResolutorDePrompts {
  /** El texto EN VIGOR de un prompt: el override si existe, el del código si no. */
  promptDe(key: string): Promise<string>;
  /** Publica el catálogo en platform. Best-effort: no debe tumbar el arranque. */
  publicarCatalogo(): Promise<void>;
  invalidar(): void;
}

export function createPromptCatalog(cfg: CatalogoPromptsConfig): ResolutorDePrompts {
  const cacheMs = cfg.cacheMs ?? 60_000;
  const delCodigo = (key: string) => cfg.catalogo.find((p) => p.key === key)?.texto ?? '';
  let cache: { valores: Map<string, string>; expira: number } | null = null;

  async function cargar(): Promise<Map<string, string>> {
    if (cache && cache.expira > Date.now()) return cache.valores;
    const valores = new Map<string, string>();
    try {
      for (const row of await cfg.prisma.aiPrompt.findMany({ where: { app: cfg.app } })) {
        if (row.overridePrompt?.trim()) valores.set(row.promptKey, row.overridePrompt);
      }
    } catch {
      // Sin BD: el mapa queda vacío y todo cae al texto del código, que es
      // exactamente lo que se quiere.
    }
    cache = { valores, expira: Date.now() + cacheMs };
    return valores;
  }

  return {
    async promptDe(key: string): Promise<string> {
      const v = (await cargar()).get(key);
      return v?.trim() ? v : delCodigo(key);
    },

    async publicarCatalogo(): Promise<void> {
      if (!cfg.platformUrl || !cfg.serviceKey) {
        console.warn(`[ai-prompts] ${cfg.app}: sin platformUrl/serviceKey — el catálogo no se publica`);
        return;
      }
      try {
        const res = await fetch(`${cfg.platformUrl.replace(/\/$/, '')}/internal/ai-prompts/catalog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Service-Key': cfg.serviceKey },
          body: JSON.stringify({
            app: cfg.app,
            prompts: cfg.catalogo.map((p, i) => ({
              promptKey: p.key, grupo: p.grupo, titulo: p.titulo,
              descripcion: p.descripcion, defaultPrompt: p.texto, orden: i,
            })),
          }),
        });
        if (!res.ok) console.warn(`[ai-prompts] ${cfg.app}: publicación falló HTTP ${res.status}`);
      } catch (err) {
        console.warn(`[ai-prompts] ${cfg.app}: publicación falló — ${err instanceof Error ? err.message : err}`);
      }
    },

    invalidar() { cache = null; },
  };
}
