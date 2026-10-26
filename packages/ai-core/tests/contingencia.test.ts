// La contingencia de modelo: cuándo salta, cuándo no, y que sea pegajosa en un turno de agente.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { conContingencia, turnoConContingencia, esFalloDeCapacidad, SinCapacidadSimuladaError } from '../src/contingencia';

const http = (status: number) => Object.assign(new Error(`http ${status}`), { response: { status } });

afterEach(() => { delete process.env.IA_SIMULAR_SIN_CAPACIDAD; vi.restoreAllMocks(); });

describe('esFalloDeCapacidad', () => {
  it('429, 5xx, timeout y red sí; 400 y errores nuestros no', () => {
    expect(esFalloDeCapacidad(http(429))).toBe(true);
    expect(esFalloDeCapacidad(http(503))).toBe(true);
    expect(esFalloDeCapacidad(Object.assign(new Error('t'), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(esFalloDeCapacidad(http(400))).toBe(false);
    // Tiempo agotado de gaxios: sin respuesta, sin code ni type.
    class GaxiosError extends Error {}
    expect(esFalloDeCapacidad(new GaxiosError('The operation was aborted.'))).toBe(true);
    expect(esFalloDeCapacidad(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(esFalloDeCapacidad(new Error('timeout of 60000ms exceeded'))).toBe(true);
    expect(esFalloDeCapacidad(new Error('requiere un modelo Gemini'))).toBe(false);
  });
});

describe('conContingencia', () => {
  it('sin fallo responde el primario con UN solo intento', async () => {
    const llamar = vi.fn(async (m: string, p?: { attempts?: number }) => `${m}:${p?.attempts}`);
    const r = await conContingencia({ modelo: 'a', contingencia: 'b', llamar });
    expect(r).toEqual({ resultado: 'a:1', modelo: 'a', contingencia: false });
  });

  it('un 429 del primario pasa a la contingencia (también en segundo plano) y deja la línea de log', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const llamar = vi.fn(async (m: string) => { if (m === 'a') throw http(429); return 'ok-b'; });
    const r = await conContingencia({ modelo: 'a', contingencia: 'b', llamar, app: 'consultor', tarea: 'consultor:mycobot_chat' });
    expect(r).toEqual({ resultado: 'ok-b', modelo: 'b', contingencia: true });
    expect(log.mock.calls[0]?.[0]).toBe('[ia_contingencia]');
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({ app: 'consultor', primario: 'a', contingencia: 'b', motivo: 429 });
  });

  it('un 400 no salta: es un error nuestro y otro modelo no lo arregla', async () => {
    const llamar = vi.fn(async () => { throw http(400); });
    await expect(conContingencia({ modelo: 'a', contingencia: 'b', llamar })).rejects.toThrow('http 400');
    expect(llamar).toHaveBeenCalledTimes(1);
  });

  it('interactiva: no salta si no quedan 5 s; si quedan, la contingencia gasta lo que queda', async () => {
    let t = 0;
    const llamar = vi.fn(async (m: string, p?: { deadlineMs?: number }) => { if (m === 'a') { t += 58_000; throw http(503); } return p?.deadlineMs; });
    await expect(conContingencia({ modelo: 'a', contingencia: 'b', presupuesto: { timeoutMs: 60_000, deadlineMs: 60_000 }, llamar, ahora: () => t })).rejects.toThrow('503');
    t = 0;
    const llamar2 = vi.fn(async (m: string, p?: { deadlineMs?: number }) => { if (m === 'a') { t += 20_000; throw http(503); } return p?.deadlineMs; });
    const r = await conContingencia({ modelo: 'a', contingencia: 'b', presupuesto: { timeoutMs: 60_000, deadlineMs: 60_000 }, llamar: llamar2, ahora: () => t });
    expect(r).toMatchObject({ modelo: 'b', resultado: 40_000 });
  });

  it('sin contingencia, el primario con los intentos de siempre', async () => {
    const llamar = vi.fn(async (_m: string, p?: { attempts?: number }) => p?.attempts);
    expect((await conContingencia({ modelo: 'a', contingencia: null, presupuesto: { attempts: 3 }, llamar })).resultado).toBe(3);
  });

  it('la simulación da 429 al modelo indicado sin llamarlo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.IA_SIMULAR_SIN_CAPACIDAD = 'a';
    const llamar = vi.fn(async (m: string) => m);
    const r = await conContingencia({ modelo: 'a', contingencia: 'b', llamar });
    expect(r.modelo).toBe('b');
    expect(llamar).toHaveBeenCalledTimes(1);
    expect(llamar).toHaveBeenCalledWith('b', expect.anything());
    process.env.IA_SIMULAR_SIN_CAPACIDAD = 'a,b';
    await expect(conContingencia({ modelo: 'a', contingencia: 'b', llamar })).rejects.toBeInstanceOf(SinCapacidadSimuladaError);
  });
});

describe('turnoConContingencia', () => {
  it('una vez en la contingencia, el resto del turno va directo a ella (thoughtSignature)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const llamados: string[] = [];
    let primeraVez = true;
    const llamar = async (m: string) => { llamados.push(m); if (m === 'a' && primeraVez) { primeraVez = false; throw http(429); } return m; };
    const turno = turnoConContingencia({ modelo: 'a', contingencia: 'b' });
    expect(await turno.llamar(llamar)).toBe('b');
    expect(await turno.llamar(llamar)).toBe('b');
    expect(turno.enContingencia).toBe(true);
    expect(llamados).toEqual(['a', 'b', 'b']);
  });
});
