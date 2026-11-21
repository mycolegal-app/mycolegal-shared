// Los datos derivados de INTERVINIENTE (0.3.19, Carles, 20-nov-2026): la nacionalidad española de quien se identifica
// con DNI, deducida; el país de residencia fiscal por el domicilio, sólo propuesto.
import { describe, it, expect } from 'vitest';
import { derivar, resolverRequisitos } from '../src/motor';
import type { DerivadoDef, NodoTipo, RepositorioRequisitos } from '../src/puerto';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';

const DNI = '^([0-9]{8}|[KLkl][0-9]{7})[A-Za-z]$';
const NACIONALIDAD: DerivadoDef = {
  fact: 'SUJETO.NACIONALIDAD',
  tramos: [{ valor: 'ESP', porQue: 'Se identifica con DNI.', si: [
    { fact: 'SUJETO.TIPO_DOCUMENTO', op: 'EQ', valor: 'NIF', scopeRol: null, paraTipo: null },
    { fact: 'SUJETO.NUM_DOCUMENTO', op: 'MATCHES', valor: DNI, scopeRol: null, paraTipo: null },
  ] }],
};
const RESIDENCIA: DerivadoDef = {
  fact: 'SUJETO.PAIS_RESIDENCIA_FISCAL',
  tramos: [{ valor: 'España', porQue: 'Reside habitualmente en España.', propone: true, si: [
    { fact: 'SUJETO.RESIDENCIA_HABITUAL_EN_ESPANA', op: 'EQ', valor: true, scopeRol: null, paraTipo: null },
  ] }],
};
const s = (id: string, hechos: Record<string, unknown>) => ({ id, rol: 'VENDEDOR', tipo: 'PERSONA_FISICA', hechos });

describe('derivar por interviniente', () => {
  it('sin `porSujeto`, como siempre: nada de SUJETO', () => {
    expect(derivar([NACIONALIDAD], { sujetos: [s('a', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: '12345678Z' })] }, {})).toEqual([]);
  });
  it('uno por cada uno: el del DNI es español; el del NIE, no se deduce; el del NIF «M» tampoco', () => {
    const r = derivar([NACIONALIDAD], { sujetos: [
      s('a', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: '12345678Z' }),
      s('b', { TIPO_DOCUMENTO: 'NIE', NUM_DOCUMENTO: 'X1234567L' }),
      s('c', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: 'M1234567L' }),
      s('d', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: 'L1234567L' }),
    ] }, {}, { porSujeto: true });
    expect(r.map((d) => [d.sujetoId, d.valor])).toEqual([['a', 'ESP'], ['d', 'ESP']]);
  });
  it('sin el número todavía: no se deduce (falta un dato)', () => {
    expect(derivar([NACIONALIDAD], { sujetos: [s('a', { TIPO_DOCUMENTO: 'NIF' })] }, {}, { porSujeto: true })).toEqual([]);
  });
  it('lo contestado de esa persona manda', () => {
    expect(derivar([NACIONALIDAD], { sujetos: [s('a', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: '12345678Z', NACIONALIDAD: 'FRA' })] }, {}, { porSujeto: true })).toEqual([]);
  });
  it('un tramo que propone sale marcado y no cuenta como sabido', () => {
    const r = derivar([RESIDENCIA], { sujetos: [s('a', { RESIDENCIA_HABITUAL_EN_ESPANA: true }), s('b', { RESIDENCIA_HABITUAL_EN_ESPANA: false })] }, {}, { porSujeto: true });
    expect(r).toEqual([{ fact: 'SUJETO.PAIS_RESIDENCIA_FISCAL', valor: 'España', porQue: 'Reside habitualmente en España.', sujetoId: 'a', propone: true }]);
  });
  it('MATCHES: un dato vacío no tiene formato; una expresión mal escrita no se finge sabida', () => {
    const MAL: DerivadoDef = { fact: 'SUJETO.X', tramos: [{ valor: 1, porQue: null, si: [{ fact: 'SUJETO.NUM_DOCUMENTO', op: 'MATCHES', valor: '([', scopeRol: null, paraTipo: null }] }] };
    expect(derivar([MAL], { sujetos: [s('a', { NUM_DOCUMENTO: '1' })] }, {}, { porSujeto: true })).toEqual([]);
    expect(derivar([NACIONALIDAD], { sujetos: [s('a', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: '' })] }, {}, { porSujeto: true })).toEqual([]);
  });
});

describe('resolverRequisitos con derivarPorSujeto', () => {
  const TIPOS_SUJETO: NodoTipo[] = [{ codigo: 'SUJETO', parentCodigo: null }, { codigo: 'PERSONA_FISICA', parentCodigo: 'SUJETO' }];
  const extranjero = regla({ codigo: 'R_EXT', condiciones: [cond('SUJETO', 'NACIONALIDAD', 'NE', 'ESP', { tipoDato: 'ENUM' })] });
  const conDerivados = (defs: DerivadoDef[]): RepositorioRequisitos => ({
    ...repo({ reglas: [extranjero], tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO }),
    async derivados() { return defs; },
  });
  const conDni = { sujetos: [s('a', { TIPO_DOCUMENTO: 'NIF', NUM_DOCUMENTO: '12345678Z' })] };
  it('la nacionalidad deducida decide la regla y no se pregunta', async () => {
    const r = await resolverRequisitos(conDerivados([NACIONALIDAD]), '0501', conDni, { derivarPorSujeto: true });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['R_EXT']);
    expect(r.preguntas.map((p) => p.fact)).not.toContain('SUJETO.NACIONALIDAD');
  });
  it('sin la opción, como siempre: se pregunta', async () => {
    const r = await resolverRequisitos(conDerivados([NACIONALIDAD]), '0501', conDni);
    expect(r.preguntas.map((p) => p.fact)).toContain('SUJETO.NACIONALIDAD');
  });
  it('una propuesta no decide nada: se sigue preguntando', async () => {
    const PROP: DerivadoDef = { ...NACIONALIDAD, tramos: NACIONALIDAD.tramos.map((t) => ({ ...t, propone: true })) };
    const r = await resolverRequisitos(conDerivados([PROP]), '0501', conDni, { derivarPorSujeto: true });
    expect(r.preguntas.map((p) => p.fact)).toContain('SUJETO.NACIONALIDAD');
    expect(r.derivados).toEqual([expect.objectContaining({ sujetoId: 'a', propone: true })]);
  });
});
