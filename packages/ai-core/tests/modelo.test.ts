// El resolutor de modelo por tarea: la caché y la reserva.
import { describe, it, expect, vi } from 'vitest';
import { createTaskModelResolver, type CatalogoTareas } from '../src/modelo';

const prismaCon = (fila: { model: string; active: boolean } | null, espia = vi.fn()): CatalogoTareas => ({
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
