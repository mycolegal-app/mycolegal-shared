// 8-oct-2026: DISPONE_DE_SUS_BIENES se deduce del rol, no se presume. Una presunción vale igual
// para todos los intervinientes; el rol distingue al menor que vende del que compra.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';

const autorizacion = regla({
  codigo: 'AUTORIZACION_JUDICIAL',
  condiciones: [cond('SUJETO', 'DISPONE_DE_SUS_BIENES', 'EQ', true)],
});
const r = (sujetos: { id: string; rol?: string | null; hechos: Record<string, unknown> }[], presunciones = {}) =>
  resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, reglas: [autorizacion] }), '0501',
    { sujetos: sujetos.map((s) => ({ tipo: 'PERSONA_FISICA', ...s })) }, { presunciones });
const codigos = (xs: { codigo: string }[]) => xs.map((x) => x.codigo);

describe('DISPONE_DE_SUS_BIENES se deduce del rol', () => {
  it('el vendedor dispone: la autorización es firme sin preguntar', async () => {
    const res = await r([{ id: 'v', rol: 'VENDEDOR', hechos: {} }]);
    expect(codigos(res.firmes)).toEqual(['AUTORIZACION_JUDICIAL']);
    expect(res.preguntas.map((p) => p.fact)).not.toContain('SUJETO.DISPONE_DE_SUS_BIENES');
  });

  it('el comprador no dispone: descartada', async () => {
    const res = await r([{ id: 'c', rol: 'COMPRADOR', hechos: {} }]);
    expect(codigos(res.descartados)).toEqual(['AUTORIZACION_JUDICIAL']);
  });

  it('el donante (hijo de DISPONENTE) dispone', async () => {
    const res = await r([{ id: 'd', rol: 'DONANTE', hechos: {} }]);
    expect(codigos(res.firmes)).toEqual(['AUTORIZACION_JUDICIAL']);
  });

  it('un rol fuera de las dos ramas sigue en duda y se pregunta', async () => {
    const res = await r([{ id: 'h', rol: 'HEREDERO', hechos: {} }]);
    expect(codigos(res.condicionados)).toEqual(['AUTORIZACION_JUDICIAL']);
    expect(res.preguntas.map((p) => p.fact)).toContain('SUJETO.DISPONE_DE_SUS_BIENES');
  });

  it('sin rol sigue en duda (no se deduce nada)', async () => {
    const res = await r([{ id: 'x', rol: null, hechos: {} }]);
    expect(codigos(res.condicionados)).toEqual(['AUTORIZACION_JUDICIAL']);
  });

  it('el dato del expediente manda sobre lo deducido', async () => {
    const res = await r([{ id: 'v', rol: 'VENDEDOR', hechos: { DISPONE_DE_SUS_BIENES: false } }]);
    expect(codigos(res.descartados)).toEqual(['AUTORIZACION_JUDICIAL']);
  });

  it('lo deducido manda sobre una presunción', async () => {
    const res = await r([{ id: 'v', rol: 'VENDEDOR', hechos: {} }], { 'SUJETO.DISPONE_DE_SUS_BIENES': false });
    expect(codigos(res.firmes)).toEqual(['AUTORIZACION_JUDICIAL']);
  });

  it('basta un interviniente que disponga: vendedor y comprador juntos → firme', async () => {
    const res = await r([{ id: 'v', rol: 'VENDEDOR', hechos: {} }, { id: 'c', rol: 'COMPRADOR', hechos: {} }]);
    expect(codigos(res.firmes)).toEqual(['AUTORIZACION_JUDICIAL']);
  });
});
