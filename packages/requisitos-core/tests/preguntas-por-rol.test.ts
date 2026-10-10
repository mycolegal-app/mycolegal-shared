// 9-oct-2026 (plan REQ_CATALOGO_IUI, F2.9): las preguntas saben de qué papel son.
// Con `preguntasPorRol`, una por (hecho, papel): el estado civil del vendedor y el del comprador
// deciden cosas distintas y se contestan por separado.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';

const reglas = [
  regla({
    codigo: 'CONSENTIMIENTO_CONYUGE',
    condiciones: [cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO', { scopeRolCodigo: 'VENDEDOR', tipoDato: 'ENUM' })],
  }),
  regla({
    codigo: 'DECLARACION_PRIVATIVIDAD',
    condiciones: [cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO', { scopeRolCodigo: 'COMPRADOR', tipoDato: 'ENUM' })],
  }),
  regla({
    codigo: 'CERT_RESIDENCIA',
    condiciones: [cond('SUJETO', 'ES_RESIDENTE_ESPANA', 'EQ', false)],
  }),
];
const sujetos = (v: Record<string, unknown>, c: Record<string, unknown>) => ({
  sujetos: [
    { id: 'v', rol: 'VENDEDOR', tipo: 'PERSONA_FISICA', hechos: v },
    { id: 'c', rol: 'COMPRADOR', tipo: 'PERSONA_FISICA', hechos: c },
  ],
});
const r = (h: ReturnType<typeof sujetos>, preguntasPorRol?: boolean) =>
  resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, reglas }), '0501', h, { preguntasPorRol });

describe('preguntas por papel', () => {
  it('por defecto, una por hecho, con los papeles en `roles`', async () => {
    const res = await r(sujetos({}, {}));
    const ec = res.preguntas.find((p) => p.fact === 'SUJETO.ESTADO_CIVIL')!;
    expect(ec.bloquea.sort()).toEqual(['CONSENTIMIENTO_CONYUGE', 'DECLARACION_PRIVATIVIDAD']);
    expect(ec.roles.sort()).toEqual(['COMPRADOR', 'VENDEDOR']);
    expect(ec).not.toHaveProperty('rol');
    expect(res.preguntas.find((p) => p.fact === 'SUJETO.ES_RESIDENTE_ESPANA')!.roles).toEqual([]);
  });

  it('con preguntasPorRol, una por (hecho, papel), cada una con lo suyo', async () => {
    const res = await r(sujetos({}, {}), true);
    const ec = res.preguntas.filter((p) => p.fact === 'SUJETO.ESTADO_CIVIL')
      .map((p) => [p.rol, p.bloquea]).sort();
    expect(ec).toEqual([['COMPRADOR', ['DECLARACION_PRIVATIVIDAD']], ['VENDEDOR', ['CONSENTIMIENTO_CONYUGE']]]);
    expect(res.preguntas.find((p) => p.fact === 'SUJETO.ES_RESIDENTE_ESPANA')!.rol).toBeNull();
  });

  it('contestado para el vendedor, sólo queda la del comprador', async () => {
    const res = await r(sujetos({ ESTADO_CIVIL: 'SOLTERO' }, {}), true);
    expect(res.preguntas.filter((p) => p.fact === 'SUJETO.ESTADO_CIVIL').map((p) => p.rol)).toEqual(['COMPRADOR']);
    // Y sin la opción, la pregunta sigue pero ya sólo dice COMPRADOR.
    const sin = await r(sujetos({ ESTADO_CIVIL: 'SOLTERO' }, {}));
    expect(sin.preguntas.find((p) => p.fact === 'SUJETO.ESTADO_CIVIL')!.roles).toEqual(['COMPRADOR']);
  });
});

// F4.2d (9-oct-2026): con `preguntasPorSujeto`, una pregunta por interviniente: dos vendedores,
// dos estados civiles. Sin nadie con ese papel, se pregunta por papel como antes.
describe('preguntas por interviniente', () => {
  const dosVendedores = (v1: Record<string, unknown>, v2: Record<string, unknown>) => ({
    sujetos: [
      { id: 'VENDEDOR', rol: 'VENDEDOR', tipo: 'PERSONA_FISICA', hechos: v1 },
      { id: 'VENDEDOR~2', rol: 'VENDEDOR', tipo: 'PERSONA_FISICA', hechos: v2 },
    ],
  });
  const rs = (h: ReturnType<typeof dosVendedores>) =>
    resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, reglas }), '0501', h, { preguntasPorRol: true, preguntasPorSujeto: true });

  it('una por (hecho, interviniente), con su papel', async () => {
    const res = await rs(dosVendedores({}, {}));
    const ec = res.preguntas.filter((p) => p.fact === 'SUJETO.ESTADO_CIVIL').map((p) => [p.sujetoId ?? null, p.rol, p.bloquea]).sort();
    // Los vendedores, por interviniente; el comprador no está: por papel.
    expect(ec).toEqual([
      [null, 'COMPRADOR', ['DECLARACION_PRIVATIVIDAD']],
      ['VENDEDOR', 'VENDEDOR', ['CONSENTIMIENTO_CONYUGE']],
      ['VENDEDOR~2', 'VENDEDOR', ['CONSENTIMIENTO_CONYUGE']],
    ]);
  });

  it('contestado para uno, sólo queda la del otro', async () => {
    const res = await rs(dosVendedores({ ESTADO_CIVIL: 'SOLTERO' }, {}));
    expect(res.preguntas.filter((p) => p.fact === 'SUJETO.ESTADO_CIVIL' && p.sujetoId).map((p) => p.sujetoId)).toEqual(['VENDEDOR~2']);
  });

  it('si uno ya lo cumple, la regla es firme y no se pregunta del otro', async () => {
    const res = await rs(dosVendedores({ ESTADO_CIVIL: 'CASADO' }, {}));
    expect(res.preguntas.some((p) => p.fact === 'SUJETO.ESTADO_CIVIL' && p.rol === 'VENDEDOR')).toBe(false);
    expect(res.firmes.map((x) => x.codigo)).toContain('CONSENTIMIENTO_CONYUGE');
  });
});
