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
    }): Promise<{ model: string; active: boolean } | null>;
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

export interface ResolutorDeModelo {
  /** Modelo (id de Vertex) de una tarea. */
  modeloDeTarea(taskKey: string): Promise<string>;
  /** Vacía la caché. Para los tests y para cuando Admin acaba de cambiarlo. */
  invalidar(taskKey?: string): void;
}

export function createTaskModelResolver(cfg: ResolutorDeModeloConfig): ResolutorDeModelo {
  const cacheMs = cfg.cacheMs ?? 60_000;
  const cache = new Map<string, { valor: string; expira: number }>();

  return {
    async modeloDeTarea(taskKey: string): Promise<string> {
      const hit = cache.get(taskKey);
      if (hit && hit.expira > Date.now()) return hit.valor;

      let valor = cfg.fallbackModel;
      try {
        const row = await cfg.prisma.aiTaskModel.findUnique({
          where: { app_taskKey: { app: cfg.app, taskKey } },
        });
        if (row?.active) valor = row.model;
      } catch {
        // Entorno sin BD o tabla sin migrar: se sigue con la reserva. No se
        // cachea el fallo como si fuera un acierto... pero sí se cachea el
        // VALOR, que es la reserva: si la BD está caída, insistir cada llamada
        // sólo añade latencia a un fallo conocido.
      }
      cache.set(taskKey, { valor, expira: Date.now() + cacheMs });
      return valor;
    },
    invalidar(taskKey?: string) {
      if (taskKey) cache.delete(taskKey);
      else cache.clear();
    },
  };
}
