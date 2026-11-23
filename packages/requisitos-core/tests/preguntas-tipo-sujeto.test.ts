// 23-nov-2026 (#1101/#1102, cancelación 1302 en LOCAL): GLOBAL-R48 (POR_SUJETO, de PERSONA_FISICA, si el documento es
// pasaporte…) preguntaba el tipo de documento al banco acreedor (ENTIDAD_CREDITO_TIPO). La regla aplica («algún
// interviniente es persona física»), pero sus datos sólo se preguntan a quien su tipo no excluye.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';

const TIPOS_SUJETO = [
  { codigo: 'SUJETO', parentCodigo: null },
  { codigo: 'PERSONA_FISICA', parentCodigo: 'SUJETO' },
  { codigo: 'PERSONA_JURIDICA', parentCodigo: 'SUJETO' },
  { codigo: 'ENTIDAD_CREDITO_TIPO', parentCodigo: 'PERSONA_JURIDICA' },
];
const r48 = regla({
  codigo: 'R48', scopeGeneracion: 'POR_SUJETO',
  roles: [{ rolCodigo: null, sujetoTipoCodigo: 'PERSONA_FISICA' }],
  condiciones: [cond('SUJETO', 'TIPO_DOCUMENTO', 'IN', ['PASAPORTE', 'DOC_EXTRANJERO'], { tipoDato: 'ENUM' })],
});
const resolver = (hechos: Parameters<typeof resolverRequisitos>[2], reglas = [r48]) =>
  resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO, reglas }), '0501', hechos, { preguntasPorSujeto: true });
const tipoDoc = async (h: Parameters<typeof resolverRequisitos>[2], reglas = [r48]) =>
  (await resolver(h, reglas)).preguntas.filter((p) => p.fact === 'SUJETO.TIPO_DOCUMENTO');
const deudorYBanco = (bancoTipo: string | null, deudor: Record<string, unknown> = {}) => ({ sujetos: [
  { id: 'DEUDOR', rol: 'DEUDOR', tipo: 'PERSONA_FISICA', hechos: deudor },
  { id: 'BANCO', rol: 'ACREEDOR', tipo: bancoTipo, hechos: {} },
] });

describe('preguntas de persona y tipo de interviniente de la regla', () => {
  it('sin papel: una pregunta que dice para qué tipos es (quien la reparte no se la hace al banco)', async () => {
    const ps = await tipoDoc(deudorYBanco('ENTIDAD_CREDITO_TIPO'));
    expect(ps).toHaveLength(1);
    expect(ps[0].paraTipos).toEqual(['PERSONA_FISICA']);
  });

  it('con una regla que no acota el tipo, vale para cualquiera', async () => {
    const libre = regla({
      codigo: 'LIBRE', scopeGeneracion: 'POR_SUJETO', roles: [{ rolCodigo: null, sujetoTipoCodigo: null }],
      condiciones: [cond('SUJETO', 'TIPO_DOCUMENTO', 'EQ', 'NIE', { tipoDato: 'ENUM' })],
    });
    const ps = await tipoDoc(deudorYBanco('ENTIDAD_CREDITO_TIPO'), [r48, libre]);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.every((p) => p.paraTipos === null)).toBe(true);
  });

  it('con papel y por interviniente: no se pregunta a quien la regla excluye por su tipo', async () => {
    const conPapel = regla({
      codigo: 'R48B', scopeGeneracion: 'POR_SUJETO',
      roles: [{ rolCodigo: 'ACREEDOR', sujetoTipoCodigo: 'PERSONA_FISICA' }],
      condiciones: [cond('SUJETO', 'TIPO_DOCUMENTO', 'IN', ['PASAPORTE'], { scopeRolCodigo: 'ACREEDOR', tipoDato: 'ENUM' })],
    });
    const banco = await tipoDoc({ sujetos: [
      { id: 'BANCO', rol: 'ACREEDOR', tipo: 'ENTIDAD_CREDITO_TIPO', hechos: {} },
      { id: 'BANCO~2', rol: 'ACREEDOR', tipo: 'PERSONA_FISICA', hechos: {} },
    ] }, [conPapel]);
    expect(banco.map((p) => p.sujetoId)).toEqual(['BANCO~2']);
  });
});
