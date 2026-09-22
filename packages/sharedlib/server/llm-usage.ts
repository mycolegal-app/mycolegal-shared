/**
 * Contabilidad AMBIENTAL del consumo de LLM.
 *
 * El problema que resuelve: el coste de una llamada de IA (tokens de entrada y
 * salida) viaja en la respuesta de Vertex, pero quien tiene que registrarlo es
 * `withCredits`, varias capas más arriba. Hasta ahora cada punto de llamada
 * tenía que ir pasando los tokens a mano hasta allí, y **olvidarse no hacía
 * ruido**: `usage: {}` y la operación quedaba registrada sin coste medible. Así
 * es como la función más usada de la plataforma —el dictamen del Revisor— llevaba
 * 309 operaciones sin un solo token registrado, teniendo los tokens en la mano.
 *
 * La solución es no pedírselos a nadie: el transporte (`vertexRequest`) anota
 * cada llamada en un almacén asociado al contexto de ejecución, y `withCredits`
 * lo recoge al liquidar. El punto de llamada no toca nada y no puede olvidarse.
 *
 * `AsyncLocalStorage` mantiene el almacén por cadena de ejecución asíncrona, así
 * que dos peticiones simultáneas no se mezclan aunque compartan proceso.
 *
 * Suma TODAS las llamadas del ámbito, que es más correcto que lo que podía
 * reportar un punto de llamada a mano: una acción como el dictamen hace primero
 * la recuperación vectorial y luego la redacción, y su coste real es la suma.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface LlmCall {
  /** Id del modelo Vertex, tal y como viaja en la URL (`…/models/<id>:<verbo>`). */
  model: string;
  tokensIn: number;
  tokensOut: number;
}

interface Acumulador {
  calls: LlmCall[];
}

const store = new AsyncLocalStorage<Acumulador>();

/** Abre un ámbito de contabilidad. Lo usa `withCredits`; rara vez hace falta a mano. */
export function runWithUsageScope<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({ calls: [] }, fn);
}

/**
 * Anota una llamada al modelo. Lo invoca el transporte compartido tras cada
 * respuesta con éxito. Fuera de un ámbito abierto no hace nada: llamar a la IA
 * sin `withCredits` alrededor sigue siendo válido (trabajos de fondo, sondas).
 */
export function recordLlmCall(call: LlmCall): void {
  const acc = store.getStore();
  if (!acc) return;
  if (!call.tokensIn && !call.tokensOut) return;
  acc.calls.push(call);
}

export interface UsoAcumulado {
  /** Modelo al que atribuir la operación: el de la llamada de más peso. */
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  /** Desglose por si el llamante quiere persistirlo (p.ej. en `meta`). */
  calls: LlmCall[];
}

/**
 * Consumo acumulado en el ámbito actual, o `undefined` si no hay ninguno abierto
 * o no se llamó a ningún modelo.
 *
 * El `model` que se reporta es el de la llamada con más tokens, no el último:
 * una acción con RAG hace varias llamadas de embedding baratas y una generación
 * cara, y atribuir el coste al embedding falsearía la tarifa.
 */
export function collectedUsage(): UsoAcumulado | undefined {
  const acc = store.getStore();
  if (!acc || acc.calls.length === 0) return undefined;

  let tokensIn = 0;
  let tokensOut = 0;
  let dominante = acc.calls[0];
  for (const c of acc.calls) {
    tokensIn += c.tokensIn;
    tokensOut += c.tokensOut;
    if (c.tokensIn + c.tokensOut > dominante.tokensIn + dominante.tokensOut) dominante = c;
  }
  return { model: dominante.model, tokensIn, tokensOut, calls: acc.calls };
}
