// El bucle agéntico: lo que protege, probado sin modelo.
//
// El modelo se inyecta (`llamar`), así que estos tests son deterministas: cada
// uno guiona lo que el modelo contesta y comprueba qué hace el bucle.
import { describe, it, expect } from 'vitest';
import { conversarConHerramientas, type DeclaracionHerramienta } from '../src/agente';

const HERRAMIENTAS: DeclaracionHerramienta[] = [
  { name: 'buscar', description: 'busca' },
  { name: 'leer', description: 'lee' },
];

/** Un modelo de guion: devuelve por turno lo que se le diga. */
function modeloGuionado(turnos: unknown[]) {
  let i = 0;
  const vistos: unknown[] = [];
  return {
    llamar: async (cuerpo: unknown) => { vistos.push(cuerpo); return turnos[Math.min(i++, turnos.length - 1)]; },
    vistos,
    get llamadas() { return i; },
  };
}
const texto = (t: string, inTok = 10, outTok = 5) => ({
  candidates: [{ content: { parts: [{ text: t }] } }],
  usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok },
});
const pide = (name: string, args: Record<string, unknown> = {}) => ({
  candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
});

describe('conversarConHerramientas', () => {
  it('sin herramientas pedidas, contesta y para', async () => {
    const m = modeloGuionado([texto('La respuesta.')]);
    const r = await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: 'eres útil', pregunta: '¿qué tal?',
      herramientas: HERRAMIENTAS, ejecutar: async () => ({ texto: 'nunca' }),
    });
    expect(r.texto).toBe('La respuesta.');
    expect(r.pasos).toHaveLength(0);
    expect(m.llamadas).toBe(1);
    expect(r.agotado).toBe(false);
  });

  it('ejecuta la herramienta, la mete en la conversación y vuelve a preguntar', async () => {
    const m = modeloGuionado([pide('buscar', { q: 'hipoteca' }), texto('He encontrado dos.')]);
    const r = await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: '', pregunta: 'busca hipoteca',
      herramientas: HERRAMIENTAS,
      ejecutar: async (nombre, args) => ({ texto: `resultado de ${nombre}:${JSON.stringify(args)}` }),
    });
    expect(r.texto).toBe('He encontrado dos.');
    expect(r.pasos).toEqual([expect.objectContaining({ vuelta: 1, herramienta: 'buscar', args: { q: 'hipoteca' } })]);
    // La PETICIÓN del modelo tiene que quedar en la conversación antes de la
    // respuesta, o el protocolo no casa una con otra.
    const segundo = m.vistos[1] as { contents: { role: string; parts: unknown[] }[] };
    expect(segundo.contents.map((c) => c.role)).toEqual(['user', 'model', 'function']);
  });

  it('acumula el consumo de TODAS las vueltas: sin eso no se puede imputar', async () => {
    const m = modeloGuionado([pide('buscar'), pide('leer'), texto('Ya está.', 7, 3)]);
    const r = await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: '', pregunta: 'x',
      herramientas: HERRAMIENTAS, ejecutar: async () => ({ texto: 'ok' }),
    });
    expect(r.tokensIn).toBe(20 + 20 + 7);
    expect(r.tokensOut).toBe(8 + 8 + 3);
    expect(r.pasos.map((p) => p.herramienta)).toEqual(['buscar', 'leer']);
  });

  it('una herramienta que revienta NO tumba la conversación: el error va al modelo', async () => {
    const m = modeloGuionado([pide('leer', { clave: 'NO_EXISTE' }), texto('Ese no existe; quizá te refieres a otro.')]);
    const r = await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: '', pregunta: 'lee NO_EXISTE',
      herramientas: HERRAMIENTAS,
      ejecutar: async () => { throw new Error('no se pudo leer'); },
    });
    expect(r.texto).toContain('quizá te refieres');
    expect(r.pasos[0].error).toBe('no se pudo leer');
    const segundo = m.vistos[1] as { contents: { parts: { functionResponse?: { response: unknown } }[] }[] };
    expect(segundo.contents[2].parts[0].functionResponse!.response).toEqual({ error: 'no se pudo leer' });
  });

  it('con el tope alcanzado devuelve `agotado`, y no un error', async () => {
    // Un modelo que pide herramientas para siempre: es el caso que se come el
    // presupuesto de tokens del día si no hay tope.
    const m = modeloGuionado([pide('buscar')]);
    const r = await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: '', pregunta: 'x',
      herramientas: HERRAMIENTAS, ejecutar: async () => ({ texto: 'ok' }), maxVueltas: 3,
    });
    expect(r.agotado).toBe(true);
    expect(r.texto).toBe('');
    expect(r.pasos).toHaveLength(3);
    expect(m.llamadas).toBe(3);
  });

  it('recoge el `extra` de las herramientas, que es por donde sale una propuesta', async () => {
    const m = modeloGuionado([pide('leer'), texto('listo')]);
    const r = await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: '', pregunta: 'x',
      herramientas: HERRAMIENTAS,
      ejecutar: async () => ({ texto: 'ok', extra: { propuesta: { clave: 'PARR_X' } } }),
    });
    expect(r.extras.propuesta).toEqual([{ clave: 'PARR_X' }]);
  });

  it('arrastra la historia previa en el orden correcto', async () => {
    const m = modeloGuionado([texto('ok')]);
    await conversarConHerramientas({
      llamar: m.llamar, systemPrompt: '', pregunta: 'y la segunda?',
      historia: [{ rol: 'user', texto: 'la primera' }, { rol: 'model', texto: 'esta' }],
      herramientas: HERRAMIENTAS, ejecutar: async () => ({ texto: '' }),
    });
    const primero = m.vistos[0] as { contents: { role: string; parts: { text: string }[] }[] };
    expect(primero.contents.map((c) => [c.role, c.parts[0].text])).toEqual([
      ['user', 'la primera'], ['model', 'esta'], ['user', 'y la segunda?'],
    ]);
  });
});
