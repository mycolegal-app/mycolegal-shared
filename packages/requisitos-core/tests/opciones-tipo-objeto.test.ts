// Vía A (Carles, 23-nov-2026; cancelación 1302 BS para el IUI): la pregunta del tipo de bien ofrece, además del tipo
// que pide la regla, los tipos concretos por debajo de él. Con sólo «URBANO», MycoBot no podía decir LOCAL aunque la
// nota simple lo dijera. La regla se resuelve igual: LOCAL es un URBANO.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos, FACT_TIPO_OBJETO } from '../src/motor';
import { regla, repo, TIPOS_SUJETO } from './ayuda';

const TIPOS = [
  { codigo: 'OBJETO', parentCodigo: null },
  { codigo: 'INMUEBLE', parentCodigo: 'OBJETO' },
  { codigo: 'URBANO', parentCodigo: 'INMUEBLE' },
  { codigo: 'LOCAL', parentCodigo: 'URBANO' },
  { codigo: 'VIVIENDA', parentCodigo: 'URBANO' },
  { codigo: 'VIVIENDA_PH', parentCodigo: 'VIVIENDA' },
  { codigo: 'RUSTICA', parentCodigo: 'INMUEBLE' },
];
const reglas = [
  regla({ codigo: 'NOTA', objetos: [{ objetoTipoCodigo: 'INMUEBLE' }] }),
  regla({ codigo: 'CEDULA', objetos: [{ objetoTipoCodigo: 'VIVIENDA' }] }),
];
const r = (objetos: { id: string; tipo: string | null; hechos: Record<string, unknown> }[] = []) =>
  resolverRequisitos(repo({ tiposObjeto: TIPOS, tiposSujeto: TIPOS_SUJETO, reglas }), '0501', objetos.length ? { objetos } : {});

describe('opciones del tipo de bien', () => {
  it('el tipo pedido (VIVIENDA), sus descendientes y «Ninguno de estos»', async () => {
    const p = (await r()).preguntas.find((x) => x.fact === FACT_TIPO_OBJETO)!;
    expect(p.opciones).toEqual(['VIVIENDA', 'VIVIENDA_PH', 'NINGUNO_DE_ESTOS']);
  });

  it('elegir un descendiente cumple la regla', async () => {
    const res = await r([{ id: 'o1', tipo: 'VIVIENDA_PH', hechos: {} }]);
    expect(res.firmes.map((x) => x.codigo)).toContain('CEDULA');
  });
});
