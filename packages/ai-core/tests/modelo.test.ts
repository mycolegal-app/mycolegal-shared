// El resolutor de modelo por tarea: la caché y la reserva.
import { describe, it, expect, vi } from 'vitest';
import { createTaskModelResolver, thinkingConfigDe, type CatalogoTareas } from '../src/modelo';

const prismaCon = (fila: { model: string; active: boolean; thinkingBudget?: number | null } | null, espia = vi.fn()): CatalogoTareas => ({
  aiTaskModel: { findUnique: async (args) => { espia(args); return fila; } },
});

describe('createTaskModelResolver', () => {
  it('usa el modelo de la tabla cuando la fila está activa', async () => {
    const r = createTaskModelResolver({
      prisma: prismaCon({ model: 'gemini-3.7-pro', active: true }),
      app: 'redactor', fallbackModel: 'de-reserva',
    });
    expect(await r.modeloDeTarea('redactor:mycobot')).toBe('gemini-3.7-pro');
  });

  it('cae a la reserva si la fila está INACTIVA, que es como se desactiva una tarea', async () => {
    const r = createTaskModelResolver({
      prisma: prismaCon({ model: 'gemini-3.7-pro', active: false }),
      app: 'redactor', fallbackModel: 'de-reserva',
    });
    expect(await r.modeloDeTarea('x')).toBe('de-reserva');
  });

  it('cae a la reserva si la consulta revienta: un fallo de BD no mata la función de IA', async () => {
    const r = createTaskModelResolver({
      prisma: { aiTaskModel: { findUnique: async () => { throw new Error('sin BD'); } } },
      app: 'redactor', fallbackModel: 'de-reserva',
    });
    expect(await r.modeloDeTarea('x')).toBe('de-reserva');
  });

  it('cachea: la segunda llamada no vuelve a la base', async () => {
    const espia = vi.fn();
    const r = createTaskModelResolver({
      prisma: prismaCon({ model: 'm', active: true }, espia),
      app: 'redactor', fallbackModel: 'f',
    });
    await r.modeloDeTarea('t'); await r.modeloDeTarea('t');
    expect(espia).toHaveBeenCalledTimes(1);
    // Y se puede invalidar, que es lo que hace falta cuando Admin acaba de
    // cambiarlo y no se quiere esperar el minuto.
    r.invalidar('t');
    await r.modeloDeTarea('t');
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it('consulta por (app, taskKey): el mismo taskKey en dos apps son dos filas', async () => {
    const espia = vi.fn();
    const r = createTaskModelResolver({
      prisma: prismaCon({ model: 'm', active: true }, espia), app: 'redactor', fallbackModel: 'f',
    });
    await r.modeloDeTarea('mycobot');
    expect(espia).toHaveBeenCalledWith({ where: { app_taskKey: { app: 'redactor', taskKey: 'mycobot' } } });
  });
});

// El catálogo de prompts: la resolución y la caída, que es donde estaba el fallo
// del nombre de columna.
describe('createPromptCatalog', () => {
  const CATALOGO = [{ key: 'k', grupo: 'g', titulo: 't', descripcion: 'd', texto: 'EL DEL CÓDIGO' }];

  it('el override de Admin gana', async () => {
    const { createPromptCatalog } = await import('../src/prompts');
    const c = createPromptCatalog({
      prisma: { aiPrompt: { findMany: async () => [{ promptKey: 'k', prompt: 'EL DE ADMIN', defaultPrompt: 'x' }] } },
      app: 'redactor', catalogo: CATALOGO,
    });
    expect(await c.promptDe('k')).toBe('EL DE ADMIN');
  });

  it('sin override cae al defaultPrompt de la BASE, no al del código', async () => {
    // Importa: si Admin revirtió un prompt, la fila guarda el default con el que
    // se publicó, que puede ser anterior al del despliegue actual.
    const { createPromptCatalog } = await import('../src/prompts');
    const c = createPromptCatalog({
      prisma: { aiPrompt: { findMany: async () => [{ promptKey: 'k', prompt: null, defaultPrompt: 'EL DE LA BASE' }] } },
      app: 'redactor', catalogo: CATALOGO,
    });
    expect(await c.promptDe('k')).toBe('EL DE LA BASE');
  });

  it('si la BD falla, el texto del código: una llamada no se queda sin prompt', async () => {
    const { createPromptCatalog } = await import('../src/prompts');
    const c = createPromptCatalog({
      prisma: { aiPrompt: { findMany: async () => { throw new Error('sin BD'); } } },
      app: 'redactor', catalogo: CATALOGO,
    });
    expect(await c.promptDe('k')).toBe('EL DEL CÓDIGO');
  });

  it('una clave que no está en ninguna parte devuelve cadena vacía, no `undefined`', async () => {
    const { createPromptCatalog } = await import('../src/prompts');
    const c = createPromptCatalog({
      prisma: { aiPrompt: { findMany: async () => [] } }, app: 'redactor', catalogo: CATALOGO,
    });
    expect(await c.promptDe('no-existe')).toBe('');
  });
});

describe('configDeTarea', () => {
  it('trae el presupuesto de razonamiento de la fila', async () => {
    const r = createTaskModelResolver({ prisma: prismaCon({ model: 'm', active: true, thinkingBudget: 0 }), app: 'redactor', fallbackModel: 'f' });
    expect(await r.configDeTarea('t')).toEqual({ model: 'm', thinkingBudget: 0, modelContingencia: null });
  });

  it('sin fila, la reserva y sin presupuesto (decide el modelo)', async () => {
    const r = createTaskModelResolver({ prisma: prismaCon(null), app: 'redactor', fallbackModel: 'f' });
    expect(await r.configDeTarea('t')).toEqual({ model: 'f', thinkingBudget: null, modelContingencia: null });
  });

  it('modeloDeTarea y configDeTarea comparten la caché', async () => {
    const espia = vi.fn();
    const r = createTaskModelResolver({ prisma: prismaCon({ model: 'm', active: true, thinkingBudget: 512 }, espia), app: 'redactor', fallbackModel: 'f' });
    await r.configDeTarea('t'); expect(await r.modeloDeTarea('t')).toBe('m');
    expect(espia).toHaveBeenCalledTimes(1);
  });
});

describe('thinkingConfigDe', () => {
  it('0 se manda (es «no razones»), null no se manda', () => {
    expect(thinkingConfigDe({ thinkingBudget: 0 })).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    expect(thinkingConfigDe({ thinkingBudget: null })).toEqual({});
  });
});

describe('categorías de modelo: contingencia y regla del «pro»', () => {
  it('devuelve la contingencia de la tarea (null si la fila no la trae)', async () => {
    const r = createTaskModelResolver({
      prisma: { aiTaskModel: { findUnique: async () => ({ model: 'gemini-3.8-flash', active: true, thinkingBudget: 0, modelContingencia: 'gemini-3.5-flash' }) } },
      app: 'web', fallbackModel: 'x',
    });
    expect(await r.configDeTarea('web:t')).toEqual({ model: 'gemini-3.8-flash', thinkingBudget: 0, modelContingencia: 'gemini-3.5-flash' });
    const sin = createTaskModelResolver({ prisma: prismaCon({ model: 'm', active: true }), app: 'web', fallbackModel: 'x' });
    expect((await sin.configDeTarea('t')).modelContingencia).toBeNull();
  });

  it('un presupuesto 0 no se manda a un modelo «pro» (daría 400); a un flash sí', () => {
    expect(thinkingConfigDe({ thinkingBudget: 0 }, 'gemini-9-pro')).toEqual({});
    expect(thinkingConfigDe({ thinkingBudget: 0 }, 'gemini-3.8-flash')).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
    expect(thinkingConfigDe({ thinkingBudget: 2048 }, 'gemini-9-pro')).toEqual({ thinkingConfig: { thinkingBudget: 2048 } });
  });
});

describe('Gemini 4 (Argon): razonamiento por nivel, no por presupuesto', () => {
  it('traduce el presupuesto a nivel y no manda nada si lo decide el modelo', () => {
    expect(thinkingConfigDe({ thinkingBudget: 8192 }, 'gemini-4-argon')).toEqual({ thinkingConfig: { thinkingLevel: 'HIGH' } });
    expect(thinkingConfigDe({ thinkingBudget: 4096 }, 'gemini-4-argon')).toEqual({ thinkingConfig: { thinkingLevel: 'LOW' } });
    expect(thinkingConfigDe({ thinkingBudget: 1024 }, 'gemini-4-argon')).toEqual({ thinkingConfig: { thinkingLevel: 'LOW' } });
    expect(thinkingConfigDe({ thinkingBudget: 0 }, 'gemini-4-argon')).toEqual({ thinkingConfig: { thinkingLevel: 'LOW' } });
    expect(thinkingConfigDe({ thinkingBudget: -1 }, 'gemini-4-argon')).toEqual({});
    expect(thinkingConfigDe({ thinkingBudget: null }, 'gemini-4-argon')).toEqual({});
    expect(thinkingConfigDe({ thinkingBudget: 2048 }, 'gemini-3.8-flash')).toEqual({ thinkingConfig: { thinkingBudget: 2048 } });
  });
});
