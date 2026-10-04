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
      app: 'docfilling', fallbackModel: 'de-reserva',
    });
    expect(await r.modeloDeTarea('docfilling:mycobot')).toBe('gemini-3.7-pro');
  });

  it('cae a la reserva si la fila está INACTIVA, que es como se desactiva una tarea', async () => {
    const r = createTaskModelResolver({
      prisma: prismaCon({ model: 'gemini-3.7-pro', active: false }),
      app: 'docfilling', fallbackModel: 'de-reserva',
    });
    expect(await r.modeloDeTarea('x')).toBe('de-reserva');
  });

  it('cae a la reserva si la consulta revienta: un fallo de BD no mata la función de IA', async () => {
    const r = createTaskModelResolver({
      prisma: { aiTaskModel: { findUnique: async () => { throw new Error('sin BD'); } } },
      app: 'docfilling', fallbackModel: 'de-reserva',
    });
    expect(await r.modeloDeTarea('x')).toBe('de-reserva');
  });

  it('cachea: la segunda llamada no vuelve a la base', async () => {
    const espia = vi.fn();
    const r = createTaskModelResolver({
      prisma: prismaCon({ model: 'm', active: true }, espia),
      app: 'docfilling', fallbackModel: 'f',
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
      prisma: prismaCon({ model: 'm', active: true }, espia), app: 'docfilling', fallbackModel: 'f',
    });
    await r.modeloDeTarea('mycobot');
    expect(espia).toHaveBeenCalledWith({ where: { app_taskKey: { app: 'docfilling', taskKey: 'mycobot' } } });
  });
});
