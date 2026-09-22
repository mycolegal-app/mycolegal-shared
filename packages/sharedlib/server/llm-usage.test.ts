import { describe, it, expect } from 'vitest';
import { runWithUsageScope, recordLlmCall, collectedUsage } from './llm-usage';

/**
 * Lo que se prueba aquí es que el coste de una llamada de IA no se pierda por el
 * camino. El fallo que motivó este módulo era silencioso: la función más usada de
 * la plataforma llevaba 309 operaciones registradas sin un solo token, teniendo
 * los tokens en la mano. Un fallo silencioso solo se caza con una prueba.
 */

describe('contabilidad ambiental de LLM', () => {
  it('suma todas las llamadas del ámbito', async () => {
    const uso = await runWithUsageScope(async () => {
      recordLlmCall({ model: 'gemini-3.7-flash', tokensIn: 1000, tokensOut: 200 });
      recordLlmCall({ model: 'gemini-3.7-flash', tokensIn: 500, tokensOut: 50 });
      return collectedUsage();
    });
    expect(uso?.tokensIn).toBe(1500);
    expect(uso?.tokensOut).toBe(250);
  });

  it('atribuye la operación al modelo de MÁS peso, no al último', async () => {
    // Un dictamen hace recuperación barata y redacción cara. Atribuir el coste al
    // último modelo llamado falsearía la tarifa aplicada.
    const uso = await runWithUsageScope(async () => {
      recordLlmCall({ model: 'gemini-3.7-flash', tokensIn: 40000, tokensOut: 3000 });
      recordLlmCall({ model: 'gemini-3.5-flash-lite', tokensIn: 200, tokensOut: 10 });
      return collectedUsage();
    });
    expect(uso?.model).toBe('gemini-3.7-flash');
  });

  it('no mezcla ámbitos concurrentes', async () => {
    // Dos peticiones simultáneas comparten proceso: si se mezclaran, una
    // organización pagaría el consumo de otra.
    const [a, b] = await Promise.all([
      runWithUsageScope(async () => {
        recordLlmCall({ model: 'm-a', tokensIn: 100, tokensOut: 10 });
        await new Promise((r) => setTimeout(r, 10));
        return collectedUsage();
      }),
      runWithUsageScope(async () => {
        recordLlmCall({ model: 'm-b', tokensIn: 7, tokensOut: 1 });
        return collectedUsage();
      }),
    ]);
    expect(a?.tokensIn).toBe(100);
    expect(b?.tokensIn).toBe(7);
  });

  it('ignora respuestas sin contabilidad (embeddings)', async () => {
    // `:predict` no devuelve usageMetadata; anotar ceros ensuciaría el modelo
    // dominante con un embedding.
    const uso = await runWithUsageScope(async () => {
      recordLlmCall({ model: 'text-multilingual-embedding-002', tokensIn: 0, tokensOut: 0 });
      return collectedUsage();
    });
    expect(uso).toBeUndefined();
  });

  it('fuera de un ámbito, anotar no rompe', () => {
    // Trabajos de fondo y sondas llaman al modelo sin `withCredits` alrededor.
    expect(() => recordLlmCall({ model: 'm', tokensIn: 1, tokensOut: 1 })).not.toThrow();
    expect(collectedUsage()).toBeUndefined();
  });
});
