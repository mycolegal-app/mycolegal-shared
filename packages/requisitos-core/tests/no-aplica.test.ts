// F1 del plan de evaluación de requisitos (8-oct-2026): datos que NO EXISTEN para un
// interviniente no dejan la condición en duda, y la pregunta de tipo siempre tiene respuesta.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos, FACT_TIPO_SUJETO } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';
import type { NodoTipo, ReglaGolden } from '../src/puerto';

const TIPOS_SUJETO: NodoTipo[] = [
  { codigo: 'SUJETO', parentCodigo: null },
  { codigo: 'PERSONA_FISICA', parentCodigo: 'SUJETO' },
  { codigo: 'PERSONA_JURIDICA', parentCodigo: 'SUJETO' },
  { codigo: 'SOCIEDAD_CAPITAL', parentCodigo: 'PERSONA_JURIDICA' },
  { codigo: 'SA', parentCodigo: 'SOCIEDAD_CAPITAL' },
  { codigo: 'SL', parentCodigo: 'SOCIEDAD_CAPITAL' },
];
const BASE = { tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO };
/** Condición sobre un dato de persona física, como la declara el catálogo. */
const dePF = (codigo: string, op: string, valor: unknown, extra = {}): ReglaGolden['condiciones'][number] => {
  const c = cond('SUJETO', codigo, op, valor, extra);
  return { ...c, atributoDef: { ...c.atributoDef, sujetoTipoCodigo: 'PERSONA_FISICA' } };
};
const pf = (id: string, rol: string, hechos: Record<string, unknown>) => ({ id, rol, tipo: 'PERSONA_FISICA', hechos });

describe('datos que no existen para un interviniente', () => {
  const ley = regla({ codigo: 'LEY_EXTRANJERA', condiciones: [cond('SUJETO', 'REGIMEN_ECONOMICO', 'EQ', 'LEY_EXTRANJERA')] });

  it('vendedor casado en gananciales + comprador soltero: descartada, no en duda', async () => {
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [ley] }), '0501', { sujetos: [
      pf('v', 'VENDEDOR', { ESTADO_CIVIL: 'CASADO', REGIMEN_ECONOMICO: 'GANANCIALES' }),
      pf('c', 'COMPRADOR', { ESTADO_CIVIL: 'SOLTERO' }),
    ] });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['LEY_EXTRANJERA']);
  });

  it('un casado sin régimen leído sigue en duda: el dato existe y no se sabe', async () => {
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [ley] }), '0501', { sujetos: [
      pf('v', 'VENDEDOR', { ESTADO_CIVIL: 'CASADO' }),
    ] });
    expect(r.condicionados.map((x) => x.codigo)).toEqual(['LEY_EXTRANJERA']);
  });

  it('el estado civil de una sociedad no existe: no deja en duda «algún casado»', async () => {
    const casado = regla({ codigo: 'CONSENT_CONYUGE', condiciones: [dePF('ESTADO_CIVIL', 'EQ', 'CASADO')] });
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [casado] }), '0501', { sujetos: [
      pf('v', 'VENDEDOR', { ESTADO_CIVIL: 'SOLTERO' }),
      { id: 'c', rol: 'COMPRADOR', tipo: 'SL', hechos: {} },
    ] });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['CONSENT_CONYUGE']);
  });

  it('el representante no cuenta en una condición de estado civil sin rol', async () => {
    const casado = regla({ codigo: 'CONSENT_CONYUGE', condiciones: [dePF('ESTADO_CIVIL', 'EQ', 'CASADO')] });
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [casado] }), '0501', { sujetos: [
      pf('v', 'VENDEDOR', { ESTADO_CIVIL: 'SOLTERO' }),
      pf('r', 'REPRESENTANTE', { ESTADO_CIVIL: 'CASADO' }),
    ] });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['CONSENT_CONYUGE']);
  });

  it('quien no tiene el dato no cumple ni un NE ni un «no consta»: la regla es de quien sí puede tenerlo', async () => {
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [
      regla({ codigo: 'NO_GANANCIALES', condiciones: [cond('SUJETO', 'REGIMEN_ECONOMICO', 'NE', 'GANANCIALES')] }),
      // GLOBAL-R50: «activo esencial = NO o no consta», de la sociedad que interviene.
      regla({ codigo: 'ACTIVO', condiciones: [
        { ...cond('SUJETO', 'ACTIVO_ESENCIAL', 'EQ', false), atributoDef: { ...cond('SUJETO', 'ACTIVO_ESENCIAL', 'EQ', false).atributoDef, sujetoTipoCodigo: 'SOCIEDAD_CAPITAL' } },
        { ...cond('SUJETO', 'ACTIVO_ESENCIAL', 'NOT_EXISTS', null, { grupo: 1 }), atributoDef: { ...cond('SUJETO', 'ACTIVO_ESENCIAL', 'NOT_EXISTS', null).atributoDef, sujetoTipoCodigo: 'SOCIEDAD_CAPITAL' } },
      ] }),
    ] }), '0501', { sujetos: [pf('c', 'COMPRADOR', { ESTADO_CIVIL: 'SOLTERO' })] });
    expect(r.descartados.map((x) => x.codigo).sort()).toEqual(['ACTIVO', 'NO_GANANCIALES']);
  });
});

describe('la pregunta de tipo siempre tiene respuesta', () => {
  it('una regla de SA ofrece SA y «Ninguno de estos»; con una SL se contesta «ninguno» y se descarta', async () => {
    const reglas = [regla({ codigo: 'SA_ACCIONES', roles: [{ rolCodigo: null, sujetoTipoCodigo: 'SA' }] })];
    let r = await resolverRequisitos(repo({ ...BASE, reglas }), '1936', {});
    const p = r.preguntas.find((x) => x.fact === FACT_TIPO_SUJETO)!;
    expect(p.opciones).toEqual(['SA', 'NINGUNO_DE_ESTOS']);
    r = await resolverRequisitos(repo({ ...BASE, reglas }), '1936', { sujetos: [{ id: 's', rol: null, tipo: 'NINGUNO_DE_ESTOS', hechos: {} }] });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['SA_ACCIONES']);
    // Y sigue valiendo contestar el tipo real: una SL tampoco es una SA.
    r = await resolverRequisitos(repo({ ...BASE, reglas }), '1936', { sujetos: [{ id: 's', rol: null, tipo: 'SL', hechos: {} }] });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['SA_ACCIONES']);
  });
});

describe('condiciones en palabras, para el evaluador', () => {
  it('cada requisito trae sus condiciones con el dato entre corchetes', async () => {
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [regla({
      codigo: 'X', condCausa: 'RENUNCIA_HERENCIA',
      condiciones: [cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO', { scopeRolCodigo: 'VENDEDOR' }), cond('SUJETO', 'ES_MENOR', 'EQ', true, { grupo: 1 })],
    })] }), '0501', {});
    expect(r.condicionados[0].condicionesTexto).toEqual([
      'SUJETO.ESTADO_CIVIL [SUJETO.ESTADO_CIVIL] (rol VENDEDOR) = CASADO O SUJETO.ES_MENOR [SUJETO.ES_MENOR] = SÍ',
      'Causa o modalidad del acto [ACTO.CAUSA] = RENUNCIA_HERENCIA',
    ]);
  });
});

describe('rol comodín (Redactor)', () => {
  const regla1 = regla({ codigo: 'CONSENT', condiciones: [cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO', { scopeRolCodigo: 'VENDEDOR' })] });
  const parte = { sujetos: [{ id: 'p', rol: null, tipo: null, hechos: { ESTADO_CIVIL: 'CASADO' } }] };
  it('sin la opción, un interviniente sin rol no alcanza una condición acotada a VENDEDOR', async () => {
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [regla1] }), '0501', parte);
    expect(r.condicionados.map((x) => x.codigo)).toEqual(['CONSENT']);
  });
  it('con rolComodin, sí', async () => {
    const r = await resolverRequisitos(repo({ ...BASE, reglas: [regla1] }), '0501', parte, { rolComodin: true });
    expect(r.firmes.map((x) => x.codigo)).toEqual(['CONSENT']);
  });
});
