// 10-oct-2026 (plan REQ_CATALOGO_IUI, F4.2): las INSTANCIAS de una regla por interviniente o por
// bien miran a cada uno. La regla aplica si alguno cumple («basta que uno»), pero se pide sólo de
// los que cumplen: con dos vendedores, uno con pasaporte y otro con DNI, la acreditación del NIF
// se pide sólo del del pasaporte. Lo mismo con el tipo: la tarjeta NIF de persona jurídica, sólo
// de la sociedad.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';

const TIPOS_SUJETO = [
  { codigo: 'SUJETO', parentCodigo: null },
  { codigo: 'PERSONA_FISICA', parentCodigo: 'SUJETO' },
  { codigo: 'PERSONA_JURIDICA', parentCodigo: 'SUJETO' },
];

const nif = regla({
  codigo: 'NIF', scopeGeneracion: 'POR_SUJETO',
  roles: [{ rolCodigo: 'VENDEDOR', sujetoTipoCodigo: null }],
  condiciones: [cond('SUJETO', 'TIPO_DOCUMENTO', 'IN', ['PASAPORTE', 'DOC_EXTRANJERO'], { scopeRolCodigo: 'VENDEDOR', tipoDato: 'ENUM' })],
});
const nifPj = regla({
  codigo: 'NIF_PJ', scopeGeneracion: 'POR_SUJETO',
  roles: [{ rolCodigo: null, sujetoTipoCodigo: 'PERSONA_JURIDICA' }],
});
const conyuge = regla({
  codigo: 'CONSENTIMIENTO_CONYUGE', scopeGeneracion: 'POR_SUJETO',
  roles: [{ rolCodigo: 'VENDEDOR', sujetoTipoCodigo: null }],
  condiciones: [
    cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO', { scopeRolCodigo: 'VENDEDOR', tipoDato: 'ENUM' }),
    cond('ACTO', 'ES_VIVIENDA_HABITUAL', 'EQ', true),
  ],
});
const notaSimple = regla({
  codigo: 'NOTA', scopeGeneracion: 'POR_OBJETO',
  condiciones: [cond('OBJETO', 'INSCRITA', 'EQ', true)],
});

const resolver = (hechos: Parameters<typeof resolverRequisitos>[2]) =>
  resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO, reglas: [nif, nifPj, conyuge, notaSimple] }), '0501', hechos);
const instancias = async (h: Parameters<typeof resolverRequisitos>[2], codigo: string) => {
  const r = await resolver(h);
  const x = [...r.firmes, ...r.condicionados].find((y) => y.codigo === codigo);
  return x ? x.instancias.map((i) => i.sujetoId ?? i.objetoId).sort() : null;
};

describe('instancias por interviniente o bien', () => {
  const vendedores = (a: Record<string, unknown>, b: Record<string, unknown>, tipoB = 'PERSONA_FISICA') => ({
    sujetos: [
      { id: 'V1', rol: 'VENDEDOR', tipo: 'PERSONA_FISICA', hechos: a },
      { id: 'V2', rol: 'VENDEDOR', tipo: tipoB, hechos: b },
    ],
  });

  it('se pide sólo de quien cumple la condición', async () => {
    expect(await instancias(vendedores({ TIPO_DOCUMENTO: 'PASAPORTE' }, { TIPO_DOCUMENTO: 'NIF' }), 'NIF')).toEqual(['V1']);
  });

  it('de quien no se sabe, se sigue pidiendo (hasta que se sepa)', async () => {
    expect(await instancias(vendedores({ TIPO_DOCUMENTO: 'PASAPORTE' }, {}), 'NIF')).toEqual(['V1', 'V2']);
  });

  it('las condiciones del acto son de todos; las de la persona, de cada una', async () => {
    const h = { acto: { ES_VIVIENDA_HABITUAL: true }, ...vendedores({ ESTADO_CIVIL: 'CASADO' }, { ESTADO_CIVIL: 'SOLTERO' }) };
    expect(await instancias(h, 'CONSENTIMIENTO_CONYUGE')).toEqual(['V1']);
  });

  it('el tipo de la regla filtra a cada uno: la tarjeta NIF de persona jurídica, sólo de la sociedad', async () => {
    expect(await instancias(vendedores({}, {}, 'PERSONA_JURIDICA'), 'NIF_PJ')).toEqual(['V2']);
  });

  it('un tipo conocido PADRE del pedido no descarta: la persona de tipo genérico puede ser la sociedad', async () => {
    expect(await instancias(vendedores({}, {}, 'SUJETO'), 'NIF_PJ')).toEqual(['V2']);
  });

  it('por bien: la nota simple, sólo de las fincas inscritas', async () => {
    const h = { objetos: [
      { id: 'F1', tipo: 'VIVIENDA', hechos: { INSCRITA: true } },
      { id: 'F2', tipo: 'VIVIENDA', hechos: { INSCRITA: false } },
      { id: 'F3', tipo: 'VIVIENDA', hechos: {} },
    ] };
    expect(await instancias(h, 'NOTA')).toEqual(['F1', 'F3']);
  });
});
