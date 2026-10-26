// CONTINGENCIA DE MODELO — qué hacer cuando el modelo de una tarea se queda sin capacidad.
//
// PLAN_TECNICO_CATEGORIAS_MODELO.md. Generaliza `respaldo.ts` de Consultor (26-oct-2026:
// `gemini-3.8-flash` dio 429 en ~45 % de las llamadas durante horas, mientras otros modelos
// iban finos por el mismo transporte). El transporte (`sharedlib/vertexRequest`) reintenta
// con el MISMO modelo, que es justo lo que no sirve cuando ese modelo no tiene capacidad.
//
// Cada tarea trae de Admin su modelo y su CONTINGENCIA (materializados desde su categoría).
// Aquí: un intento con el primario; si falla por capacidad, la contingencia con el resto
// de intentos. Una sola contingencia: más saltos alargarían la espera del usuario.
//
// QUÉ ES UN FALLO DE CAPACIDAD
//
// 429, 5xx, o sin respuesta HTTP (tiempo agotado, red). Un 400 no: es un error NUESTRO
// (cuerpo mal formado, modelo que no admite algo) y otro modelo no lo arregla; enmascararlo
// solo escondería el fallo.
//
// PEGAJOSA POR TURNO
//
// En un agente con herramientas, si una ronda cae a la contingencia, el resto del turno
// sigue en ella: Gemini 3 exige de vuelta las `thoughtSignature` de cada `functionCall`, y no
// está garantizado que otro modelo acepte las del primero. `turnoConContingencia` lo hace.
//
// SIMULACIÓN
//
// `IA_SIMULAR_SIN_CAPACIDAD=<modelId>[,<modelId>…]` hace que las llamadas a esos modelos
// fallen con un 429 sin salir a Vertex. Es la única forma de probar la contingencia de punta a
// punta sin esperar a un incidente. Solo para LOCAL/TEST: en PROD no se define.

/** Intentos y techos de una llamada (lo que acepta `vertexRequest`). */
export interface PresupuestoLlamada {
  attempts?: number;
  timeoutMs?: number;
  /** Techo del TOTAL (todos los intentos). Con él la llamada es interactiva (hay alguien esperando). */
  deadlineMs?: number;
}

/** Por debajo de esto no merece la pena lanzar la contingencia de una llamada interactiva. */
const MIN_RESTANTE_MS = 5_000;
const TIMEOUT_DEFECTO_MS = 120_000;
const INTENTOS_DEFECTO = 3;

/** ¿Falla del serving (merece otro modelo) o de la petición? */
export function esFalloDeCapacidad(err: unknown): boolean {
  const e = err as { response?: { status?: number }; code?: unknown; type?: unknown; name?: unknown } | null;
  const status = e?.response?.status;
  if (status !== undefined) return status === 429 || status >= 500;
  // Sin respuesta HTTP: timeout o red (gaxios/node-fetch). Un error nuestro («requiere un modelo
  // Gemini») no trae nada de esto y no se enmascara.
  return Boolean(e?.code || e?.type || e?.name === 'FetchError');
}

/** Modelos que la simulación da por «sin capacidad» (`IA_SIMULAR_SIN_CAPACIDAD`). */
function simuladosSinCapacidad(): Set<string> {
  const v = typeof process !== 'undefined' ? process.env?.IA_SIMULAR_SIN_CAPACIDAD : undefined;
  return new Set((v ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

export class SinCapacidadSimuladaError extends Error {
  response = { status: 429 };
  constructor(public modelo: string) {
    super(`Sin capacidad (simulado): ${modelo}`);
    this.name = 'SinCapacidadSimuladaError';
  }
}

/** Datos para el registro (`ia_contingencia`): la métrica de Admin › Salud sale de esta línea. */
export interface EtiquetasContingencia {
  app?: string;
  tarea?: string;
}

export interface ResultadoContingencia<T> {
  resultado: T;
  /** El modelo que respondió de verdad. */
  modelo: string;
  /** ¿Respondió la contingencia? */
  contingencia: boolean;
}

export interface ArgsContingencia<T> extends EtiquetasContingencia {
  modelo: string;
  /** Modelo de contingencia de la tarea (de Admin). null/igual al primario = sin contingencia. */
  contingencia: string | null | undefined;
  /** Sin él, llamada en segundo plano (ingestas, lotes): también salta, con los intentos por defecto. */
  presupuesto?: PresupuestoLlamada;
  llamar: (modelo: string, presupuesto: PresupuestoLlamada | undefined) => Promise<T>;
  ahora?: () => number;
}

async function llamarSimulando<T>(modelo: string, p: PresupuestoLlamada | undefined, llamar: ArgsContingencia<T>['llamar']): Promise<T> {
  if (simuladosSinCapacidad().has(modelo)) throw new SinCapacidadSimuladaError(modelo);
  return llamar(modelo, p);
}

/**
 * Llama con el primario y, si se queda sin capacidad, con la contingencia. El presupuesto total
 * no crece: una llamada interactiva sigue cabiendo en el timeout de Cloud Run.
 */
export async function conContingencia<T>(a: ArgsContingencia<T>): Promise<ResultadoContingencia<T>> {
  const { modelo, contingencia, presupuesto: p, llamar } = a;
  const ahora = a.ahora ?? Date.now;
  if (!contingencia || contingencia === modelo) {
    return { resultado: await llamarSimulando(modelo, p, llamar), modelo, contingencia: false };
  }
  const intentos = p?.attempts ?? INTENTOS_DEFECTO;
  const timeoutMs = p?.timeoutMs ?? TIMEOUT_DEFECTO_MS;
  const interactiva = p?.deadlineMs !== undefined;
  const deadlineMs = p?.deadlineMs ?? timeoutMs * intentos;
  const t0 = ahora();
  try {
    // Un solo intento con el primario: si no tiene capacidad, repetir es esperar para nada.
    const primero: PresupuestoLlamada = { ...p, attempts: 1, ...(interactiva ? { deadlineMs: Math.min(timeoutMs, deadlineMs) } : {}) };
    return { resultado: await llamarSimulando(modelo, primero, llamar), modelo, contingencia: false };
  } catch (err) {
    if (!esFalloDeCapacidad(err)) throw err;
    const restante = deadlineMs - (ahora() - t0);
    if (interactiva && restante < MIN_RESTANTE_MS) throw err;
    registrarSalto(a, modelo, contingencia, err, ahora() - t0);
    const segundo: PresupuestoLlamada = interactiva
      ? { attempts: Math.max(1, intentos - 1), timeoutMs: Math.min(timeoutMs, restante), deadlineMs: restante }
      : { ...p, attempts: Math.max(1, intentos - 1) };
    return { resultado: await llamarSimulando(contingencia, segundo, llamar), modelo: contingencia, contingencia: true };
  }
}

function registrarSalto(e: EtiquetasContingencia, primario: string, contingencia: string, err: unknown, ms: number) {
  const status = (err as { response?: { status?: number } })?.response?.status ?? null;
  const code = (err as { code?: unknown })?.code ?? null;
  // Una línea por salto, con un prefijo fijo: de aquí sale la métrica de logs de GCP
  // (`ia_contingencia`) y el bloque de Admin › Salud (F5).
  console.warn('[ia_contingencia]', JSON.stringify({
    app: e.app ?? null, tarea: e.tarea ?? null, primario, contingencia,
    motivo: status ?? code ?? 'red', simulado: err instanceof SinCapacidadSimuladaError, ms,
  }));
}

/**
 * Contingencia PEGAJOSA para un turno de agente (varias llamadas seguidas que forman una
 * conversación con herramientas): en cuanto una cae a la contingencia, las siguientes van
 * directas a ella. Se crea uno por turno; el turno siguiente vuelve a probar el primario.
 */
export function turnoConContingencia(cfg: EtiquetasContingencia & { modelo: string; contingencia: string | null | undefined }) {
  let actual = cfg.modelo;
  let salto = false;
  return {
    /** Modelo con el que va el turno ahora mismo. */
    get modelo() { return actual; },
    /** ¿El turno ya va por la contingencia? */
    get enContingencia() { return salto; },
    async llamar<T>(llamar: ArgsContingencia<T>['llamar'], presupuesto?: PresupuestoLlamada): Promise<T> {
      if (salto) return llamarSimulando(actual, presupuesto, llamar);
      const r = await conContingencia({ ...cfg, presupuesto, llamar });
      if (r.contingencia) { salto = true; actual = r.modelo; }
      return r.resultado;
    },
  };
}
