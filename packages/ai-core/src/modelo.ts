// QUÉ MODELO USA CADA TAREA — la pieza que estaba copiada en cuatro apps.
//
// El SuperAdmin elige el modelo por tarea desde Admin (tabla `ai_task_models`,
// de la que platform es dueña). Esto resuelve «para esta tarea, qué modelo», con
// caché corta y una reserva por si la tabla no está.
//
// POR QUÉ ES UNA FÁBRICA Y NO UNA FUNCIÓN
//
// Porque lo único que cambia entre apps es el `app` con el que se consulta, el
// cliente de Prisma y el modelo de reserva. Las cuatro copias (consultor,
// tributos, tramitación, platform) eran el MISMO cuerpo con esas tres cosas
// distintas, y la prueba es que sus comentarios se citan unos a otros («calco
// reducido de consultor/tributos»). Mismo tratamiento que tuvo
// `createModelEndpointResolver`, que ya vive en `sharedlib/server`.
//
// ⚠️ EL PUERTO ES ESTRUCTURAL, NO `PrismaClient`.
//
// Pedir el cliente entero arrastraría el tipado de Prisma —y su versión— a todo
// consumidor. Aquí se pide **lo mínimo que se usa**, que además documenta
// exactamente qué toca este módulo en la base de datos: una fila, por clave
// compuesta, de solo lectura.

/** Lo mínimo que se necesita del cliente Prisma de la app consumidora. */
export interface CatalogoTareas {
  aiTaskModel: {
    findUnique(args: {
      where: { app_taskKey: { app: string; taskKey: string } };
    }): Promise<{ model: string; active: boolean; thinkingBudget?: number | null; modelContingencia?: string | null } | null>;
  };
}

export interface ResolutorDeModeloConfig {
  prisma: CatalogoTareas;
  /** Slug de la app, tal como está en `ai_task_models.app`. */
  app: string;
  /**
   * Modelo si la fila falta o está inactiva.
   *
   * ⚠️ Que esto exista es deliberado y no es pereza: un problema de
   * configuración —tabla sin sembrar, tarea desactivada por error— no debe
   * dejar la función de IA muerta. Pero tiene que ser un modelo **vivo**: las
   * copias originales llevaban `gemini-2.5-flash`, que se retira el
   * 16-oct-2026, y una reserva caducada es peor que ninguna porque falla el día
   * que de verdad hace falta.
   */
  fallbackModel: string;
  /** Milisegundos de caché. Por defecto 60 s, como las copias que sustituye. */
  cacheMs?: number;
}

/** Lo que Admin decide de una tarea: el modelo y cuánto puede razonar antes de responder. */
export interface ConfigDeTarea {
  model: string;
  /**
   * `ai_task_models.thinkingBudget`: tokens de razonamiento. `0` = no razona; `null` = lo que
   * decida el modelo (sin fila, o la columna vacía). Quien llama lo manda en
   * `generationConfig.thinkingConfig` —ver `thinkingConfigDe`—: si no lo manda, Gemini 3 razona por
   * defecto, y en Redactor eso era el grueso del tiempo (12-oct-2026: 8,8 s con 631 tokens de
   * razonamiento frente a 1,5 s con presupuesto 0, la misma pregunta).
   */
  thinkingBudget: number | null;
  /**
   * Modelo de CONTINGENCIA (PLAN_TECNICO_CATEGORIAS_MODELO): entra si el primario se queda sin
   * capacidad (ver `conContingencia`). Lo pone Admin a través de la categoría de la tarea; null =
   * sin contingencia (tareas con modelo fijo, o la columna aún no existe en el espejo de la app).
   */
  modelContingencia: string | null;
}

export interface ResolutorDeModelo {
  /** Modelo (id de Vertex) de una tarea. */
  modeloDeTarea(taskKey: string): Promise<string>;
  /** Modelo y presupuesto de razonamiento de una tarea. */
  configDeTarea(taskKey: string): Promise<ConfigDeTarea>;
  /** Vacía la caché. Para los tests y para cuando Admin acaba de cambiarlo. */
  invalidar(taskKey?: string): void;
}

export function createTaskModelResolver(cfg: ResolutorDeModeloConfig): ResolutorDeModelo {
  const cacheMs = cfg.cacheMs ?? 60_000;
  const cache = new Map<string, { valor: ConfigDeTarea; expira: number }>();

  async function configDeTarea(taskKey: string): Promise<ConfigDeTarea> {
      const hit = cache.get(taskKey);
      if (hit && hit.expira > Date.now()) return hit.valor;

      let valor: ConfigDeTarea = { model: cfg.fallbackModel, thinkingBudget: null, modelContingencia: null };
      try {
        const row = await cfg.prisma.aiTaskModel.findUnique({
          where: { app_taskKey: { app: cfg.app, taskKey } },
        });
        if (row?.active) {
          valor = { model: row.model, thinkingBudget: row.thinkingBudget ?? null, modelContingencia: row.modelContingencia ?? null };
        }
      } catch {
        // Entorno sin BD o tabla sin migrar: se sigue con la reserva. No se
        // cachea el fallo como si fuera un acierto... pero sí se cachea el
        // VALOR, que es la reserva: si la BD está caída, insistir cada llamada
        // sólo añade latencia a un fallo conocido.
      }
      cache.set(taskKey, { valor, expira: Date.now() + cacheMs });
      return valor;
  }

  return {
    async modeloDeTarea(taskKey: string): Promise<string> {
      return (await configDeTarea(taskKey)).model;
    },
    configDeTarea,
    invalidar(taskKey?: string) {
      if (taskKey) cache.delete(taskKey);
      else cache.clear();
    },
  };
}

/** ¿Modelo «pro»? No admite ir sin razonamiento (presupuesto 0 → 400). */
export function esModeloPro(model: string): boolean {
  return /-pro\b/.test(model);
}

/**
 * El `thinkingConfig` de `generationConfig` para un presupuesto de Admin, o nada si la tarea no lo
 * fija (`null`: decide el modelo). Se esparce: `generationConfig: { ...thinkingConfigDe(c, modelo), … }`.
 *
 * Con el `modelo` que va a responder (el primario o la contingencia), un presupuesto 0 en un «pro»
 * no se manda: ese modelo no admite ir sin razonamiento, y mandarlo da 400. Sin `modelo`, como antes.
 */
export function thinkingConfigDe(
  c: Pick<ConfigDeTarea, 'thinkingBudget'>,
  modelo?: string,
): { thinkingConfig?: { thinkingBudget: number } | { thinkingLevel: NivelRazonamiento } } {
  if (c.thinkingBudget === null || c.thinkingBudget === undefined) return {};
  if (modelo && usaNivelDeRazonamiento(modelo)) {
    // Gemini 4 (Argon) no admite `thinkingBudget` (400 «Use thinking level instead»): se traduce el
    // presupuesto de Admin a su nivel. -1 (dinámico) = lo decide el modelo: no se manda nada.
    if (c.thinkingBudget < 0) return {};
    return { thinkingConfig: { thinkingLevel: c.thinkingBudget >= 4096 ? 'HIGH' : 'LOW' } };
  }
  if (c.thinkingBudget === 0 && modelo && esModeloPro(modelo)) return {};
  return { thinkingConfig: { thinkingBudget: c.thinkingBudget } };
}

export type NivelRazonamiento = 'LOW' | 'HIGH';

/**
 * ¿El modelo pide el razonamiento por NIVEL (`thinkingLevel`) en vez de por presupuesto? Gemini 4
 * (Argon, 26-oct-2026) responde 400 a `thinkingBudget`. Ampliar aquí cuando salga otro así.
 */
export function usaNivelDeRazonamiento(model: string): boolean {
  return /^gemini-4/.test(model);
}
