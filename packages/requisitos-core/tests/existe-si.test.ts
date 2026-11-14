// CUÁNDO EXISTE UN DATO (`existeSi`, 0.3.16; Lanzamiento + Carles, 14-nov-2026). El garaje de Sabadell en
// LOCAL: a dos solteros se les preguntó el régimen antes que el estado civil, se contestó «Gananciales», y
// cuando entró «soltero» el «Gananciales» siguió valiendo y la escritura lo dijo.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos, existePara, type Existencias } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';
import type { ExisteSiDef, RepositorioRequisitos } from '../src/puerto';

const DEF_EC = { label: 'Estado civil', tipoDato: 'ENUM', opciones: ['SOLTERO', 'CASADO'], fuentePreferente: null };
const SI_CASADO: ExisteSiDef['si'] = [{ fact: 'SUJETO.ESTADO_CIVIL', op: 'EQ', valor: 'CASADO', def: DEF_EC }];
const EXISTE: ExisteSiDef[] = [{ fact: 'SUJETO.REGIMEN_ECONOMICO', si: SI_CASADO }];

const reglas = [regla({
  codigo: 'CERT_CAPITULACIONES',
  condiciones: [cond('SUJETO', 'REGIMEN_ECONOMICO', 'EQ', 'SEPARACION', { scopeRolCodigo: 'COMPRADOR', tipoDato: 'ENUM' })],
})];
const conExistencias = (defs: ExisteSiDef[] = EXISTE): RepositorioRequisitos =>
  ({ ...repo({ tiposObjeto: TIPOS_OBJETO, reglas }), existencias: async () => defs });
const comprador = (hechos: Record<string, unknown>) => ({ sujetos: [{ id: 'c', rol: 'COMPRADOR', tipo: 'PF', hechos }] });

describe('existePara', () => {
  const m: Existencias = new Map([['SUJETO.REGIMEN_ECONOMICO', { si: SI_CASADO, preguntable: true }]]);
  it('sin `existeSi`, existe', () => expect(existePara(m, 'SUJETO.VECINDAD_CIVIL', {})).toBe(true));
  it('casado: existe', () => expect(existePara(m, 'SUJETO.REGIMEN_ECONOMICO', { ESTADO_CIVIL: 'CASADO' })).toBe(true));
  it('soltero: no existe', () => expect(existePara(m, 'SUJETO.REGIMEN_ECONOMICO', { ESTADO_CIVIL: 'SOLTERO' })).toBe(false));
  it('sin estado civil: falta él', () => expect(existePara(m, 'SUJETO.REGIMEN_ECONOMICO', {})).toEqual(['SUJETO.ESTADO_CIVIL']));
  it('lo presumido cuenta', () =>
    expect(existePara(m, 'SUJETO.REGIMEN_ECONOMICO', {}, { 'SUJETO.ESTADO_CIVIL': 'SOLTERO' })).toBe(false));
});

describe('resolverRequisitos con `existeSi`', () => {
  it('sin estado civil, se pregunta el estado civil y no el régimen', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501', comprador({}), { preguntasPorSujeto: true });
    expect(res.preguntas.map((p) => p.fact)).toEqual(['SUJETO.ESTADO_CIVIL']);
    const p = res.preguntas[0];
    expect([p.sujetoId, p.rol, p.label, p.bloquea]).toEqual(['c', 'COMPRADOR', 'Estado civil', ['CERT_CAPITULACIONES']]);
    expect(res.condicionados[0].faltan).toEqual(['SUJETO.ESTADO_CIVIL']);
  });
  it('casado, se pregunta el régimen', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501', comprador({ ESTADO_CIVIL: 'CASADO' }), { preguntasPorSujeto: true });
    expect(res.preguntas.map((p) => p.fact)).toEqual(['SUJETO.REGIMEN_ECONOMICO']);
  });
  it('soltero: la regla se descarta y no se pregunta nada', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501', comprador({ ESTADO_CIVIL: 'SOLTERO' }));
    expect(res.preguntas).toEqual([]);
    expect(res.descartados.map((x) => x.codigo)).toEqual(['CERT_CAPITULACIONES']);
  });
  it('soltero con un régimen ya contestado: se aparta (el caso del garaje)', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501',
      comprador({ ESTADO_CIVIL: 'SOLTERO', REGIMEN_ECONOMICO: 'SEPARACION' }));
    expect(res.firmes).toEqual([]);
    expect(res.descartados.map((x) => x.codigo)).toEqual(['CERT_CAPITULACIONES']);
  });
  it('y si resulta casado, la respuesta vuelve a valer', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501',
      comprador({ ESTADO_CIVIL: 'CASADO', REGIMEN_ECONOMICO: 'SEPARACION' }));
    expect(res.firmes.map((x) => x.codigo)).toEqual(['CERT_CAPITULACIONES']);
  });
  it('sin cómo preguntar el estado civil, se pregunta el régimen, como antes', async () => {
    const sinDef = [{ fact: 'SUJETO.REGIMEN_ECONOMICO', si: [{ fact: 'SUJETO.ESTADO_CIVIL', op: 'EQ', valor: 'CASADO' }] }];
    const res = await resolverRequisitos(conExistencias(sinDef), '0501', comprador({}));
    expect(res.preguntas.map((p) => p.fact)).toEqual(['SUJETO.REGIMEN_ECONOMICO']);
  });
  it('sin intervinientes con datos (Redactor al empezar): también se pregunta el estado civil y no el régimen', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501', {}, { preguntasPorRol: true });
    expect(res.preguntas.map((p) => [p.fact, p.rol])).toEqual([['SUJETO.ESTADO_CIVIL', 'COMPRADOR']]);
  });
  it('sin intervinientes y el caso presume soltero: la regla se descarta', async () => {
    const res = await resolverRequisitos(conExistencias(), '0501', {}, { presunciones: { 'SUJETO.ESTADO_CIVIL': 'SOLTERO' } });
    expect(res.preguntas).toEqual([]);
    expect(res.descartados.map((x) => x.codigo)).toEqual(['CERT_CAPITULACIONES']);
  });
  it('sin el método en el repositorio, como en 0.3.15', async () => {
    const res = await resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, reglas }), '0501', comprador({ ESTADO_CIVIL: 'SOLTERO' }));
    expect(res.preguntas.map((p) => p.fact)).toEqual(['SUJETO.REGIMEN_ECONOMICO']);
  });
});
