// `:REQ(…)` y `:DOC(…)` — los ejemplos son las filas de «Ejemplos reales de los VAR de la
// compraventa» del documento de diseño (9-oct-2026), con la forma real del DECLARE.
import { describe, expect, it } from 'vitest';
import { parseFields, FieldType } from '../src/syntax/parser';
import { validateText } from '../src/syntax/validate';
import { extractDeclareFixedValues } from '../src/compose/engine';
import { esquemaDeCampos } from '../src/fields/schema';
import { implicaciones, inversa, tieneVuelta, normalizarValor } from '../src/fields/req';
import { leerReq, pelarReqDoc } from '../src/syntax/req-doc';

const uno = (t: string) => {
  const fs = parseFields(t);
  expect(fs).toHaveLength(1);
  return fs[0];
};
const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);

const BOOL = { tipoDato: 'BOOL' };

describe(':REQ / :DOC en el DECLARE', () => {
  it('TIPO_FINCA: mapa a booleano, con :OPTIONS y :DOC, en las dos direcciones', () => {
    const t = '{{DECLARE TIPO_FINCA:[Extraer el tipo de finca]:OPTIONS(Urbana,Rústica)' +
      ':REQ(OBJETO.SUELO_URBANO_IIVTNU; Urbana=TRUE; Rústica=FALSE):DOC(REQ_NOTA_SIMPLE | REQ_CCDG)}}';
    const f = uno(t);
    expect(f.fieldType).toBe(FieldType.DECLARE);
    expect(f.name).toBe('TIPO_FINCA');
    expect(f.extractionOptions).toEqual(['Urbana', 'Rústica']);
    expect(f.declareInstruction).toBe('Extraer el tipo de finca');
    expect(f.malformedResidue).toBe('');
    expect(f.req).toEqual([{
      ref: 'OBJETO.SUELO_URBANO_IIVTNU', ambito: 'OBJETO', codigo: 'SUELO_URBANO_IIVTNU', rol: null,
      mapa: [['Urbana', 'TRUE'], ['Rústica', 'FALSE']],
      texto: 'OBJETO.SUELO_URBANO_IIVTNU; Urbana=TRUE; Rústica=FALSE',
    }]);
    expect(f.doc).toEqual(['REQ_NOTA_SIMPLE', 'REQ_CCDG']);
    expect(codigos(t)).not.toContain('W055');
    expect(codigos(t)).not.toContain('E906');

    expect(implicaciones(f.req, 'rustica')).toEqual([{ ref: 'OBJETO.SUELO_URBANO_IIVTNU', rol: null, valor: 'FALSE' }]);
    expect(tieneVuelta(f.req[0], BOOL)).toBe(true);
    expect(inversa(f.req[0], 'SI', { hecho: BOOL, opcionesCampo: f.extractionOptions })).toBe('Urbana');
  });

  it('TIPO_FINCA_PH: con :INPUT y valores entre comillas', () => {
    const t = '{{DECLARE TIPO_FINCA_PH:INPUT(Tipo de Finca a efectos de Catastro|Suelo o Parcela,Elemento de División Horizontal)' +
      ':REQ(OBJETO.EN_PROPIEDAD_HORIZONTAL; "Elemento de División Horizontal"=TRUE; "Suelo o Parcela"=FALSE)}}';
    const f = uno(t);
    expect(f.inputOptions).toEqual(['Suelo o Parcela', 'Elemento de División Horizontal']);
    expect(f.req[0].mapa).toEqual([['Elemento de División Horizontal', 'TRUE'], ['Suelo o Parcela', 'FALSE']]);
    expect(inversa(f.req[0], false, { hecho: BOOL, opcionesCampo: f.inputOptions })).toBe('Suelo o Parcela');
  });

  it('ESTRUCTURA_VENDEDORA: un valor fija dos hechos; sólo va del campo al catálogo', () => {
    const t = '{{DECLARE ESTRUCTURA_VENDEDORA:[Analiza los documentos de identidad]' +
      ':OPTIONS(Persona Física Única,Matrimonio,Varias Personas Físicas,Sociedad)' +
      ':REQ(SUJETO.TIPO@VENDEDOR; "Persona Física Única"=PERSONA_FISICA; Matrimonio=PERSONA_FISICA; ' +
      '"Varias Personas Físicas"=PERSONA_FISICA; Sociedad=PERSONA_JURIDICA)' +
      ':REQ(SUJETO.ESTADO_CIVIL@VENDEDOR; Matrimonio=CASADO)' +
      ':DOC(REQ_DNI | REQ_NIE_TIE | REQ_TARJETA_NIF_PJ)}}';
    const f = uno(t);
    expect(f.req.map((r) => [r.ref, r.rol])).toEqual([['SUJETO.TIPO', 'VENDEDOR'], ['SUJETO.ESTADO_CIVIL', 'VENDEDOR']]);
    expect(f.doc).toHaveLength(3);
    expect(implicaciones(f.req, 'Matrimonio')).toEqual([
      { ref: 'SUJETO.TIPO', rol: 'VENDEDOR', valor: 'PERSONA_FISICA' },
      { ref: 'SUJETO.ESTADO_CIVIL', rol: 'VENDEDOR', valor: 'CASADO' },
    ]);
    const tipo = { tipoDato: 'ENUM', opciones: ['PERSONA_FISICA', 'PERSONA_JURIDICA'] };
    expect(tieneVuelta(f.req[0], tipo)).toBe(false); // PERSONA_FISICA vuelve a tres valores
    expect(inversa(f.req[0], 'PERSONA_JURIDICA', { hecho: tipo })).toBeNull();
  });

  it('EXISTEN_CARGAS: mapa parcial — «No» dice mucho, «Sí» no dice cuál', () => {
    const t = '{{DECLARE EXISTEN_CARGAS:INPUT(¿Existen Cargas sobre la finca?|Sí,No)=No' +
      ':REQ(OBJETO.TIENE_HIPOTECA; No=FALSE):REQ(OBJETO.TIENE_EMBARGO; No=FALSE)' +
      ':REQ(OBJETO.TIENE_OTRAS_CARGAS; No=FALSE)' +
      ':DOC(REQ_INFO_REGISTRAL_CONTINUADA | REQ_CERT_REGISTRAL_DOMINIO_CARGAS)}}';
    const f = uno(t);
    expect(f.inputDefault).toBe('No');
    expect(f.req).toHaveLength(3);
    expect(implicaciones(f.req, 'No').map((i) => i.valor)).toEqual(['FALSE', 'FALSE', 'FALSE']);
    expect(implicaciones(f.req, 'Sí')).toEqual([]);
    for (const r of f.req) expect(tieneVuelta(r, BOOL)).toBe(false);
  });

  it('FINCA_ES_VPO: mismo tipo, sin mapa; el valor fijo sigue siendo el valor fijo', () => {
    const t = '{{DECLARE FINCA_ES_VPO AS BOOL:[Extraer si es VPO]=FALSE:REQ(OBJETO.ES_VPO):DOC(REQ_NOTA_SIMPLE)}}';
    const f = uno(t);
    expect(f.declareType).toBe('BOOL');
    expect(f.declareValue).toBe('FALSE');
    expect(f.req[0].mapa).toBeNull();
    expect(implicaciones(f.req, 'TRUE', () => BOOL)).toEqual([{ ref: 'OBJETO.ES_VPO', rol: null, valor: 'TRUE' }]);
    expect(inversa(f.req[0], 'FALSE', { hecho: BOOL })).toBe('FALSE');
    // `extractDeclareFixedValues` no se lleva el :REQ dentro del valor.
    expect(extractDeclareFixedValues('{{DECLARE X=v:REQ(OBJETO.ES_VPO)}}')).toEqual({ X: 'v' });
  });

  it('PRESENTACION_TELEMATICA_REGISTRO: sentido inverso', () => {
    const f = uno('{{DECLARE PRESENTACION_TELEMATICA_REGISTRO:[Determina si se solicita presentación telemática]' +
      ':OPTIONS(Sí,No):REQ(ACTO.RENUNCIA_PRESENTACION_TELEMATICA; Sí=FALSE; No=TRUE)}}');
    expect(implicaciones(f.req, 'Sí')[0].valor).toBe('FALSE');
    expect(inversa(f.req[0], true, { hecho: BOOL, opcionesCampo: ['Sí', 'No'] })).toBe('No');
  });

  it('ALERTA_PARTE_NO_RESIDENTE: @* = algún interviniente', () => {
    const f = uno('{{DECLARE ALERTA_PARTE_NO_RESIDENTE:OPTIONS(Sí,No):REQ(SUJETO.ES_RESIDENTE_ESPANA@*; Sí=FALSE)}}');
    expect(f.req[0].rol).toBe('*');
  });

  it('COMP_PF_VECINDAD_VEND: el papel lo da @VENDEDOR, no el sufijo del nombre', () => {
    const f = uno('{{DECLARE COMP_PF_VECINDAD_VEND:OPTIONS(Común,Catalana,Aragonesa)' +
      ':REQ(SUJETO.VECINDAD_CIVIL@VENDEDOR; Común=COMUN; Catalana=CATALANA; Aragonesa=ARAGONESA)}}');
    const r = f.req[0];
    expect(r.rol).toBe('VENDEDOR');
    const vecindad = { tipoDato: 'ENUM', opciones: ['COMUN', 'CATALANA', 'ARAGONESA'] };
    expect(tieneVuelta(r, vecindad)).toBe(true);
    expect(inversa(r, 'CATALANA', { hecho: vecindad })).toBe('Catalana');
    // Si el catálogo tiene más valores de los que cubre el mapa, no hay vuelta.
    expect(tieneVuelta(r, { ...vecindad, opciones: [...vecindad.opciones, 'NAVARRA'] })).toBe(false);
  });

  it('PRECIO_VENTA: un dato, sin mapa ni catálogo', () => {
    const f = uno('{{DECLARE PRECIO_VENTA AS NUM:[Extrae el precio de venta global]:REQ(ACTO.CUANTIA)}}');
    expect(f.req[0].codigo).toBe('CUANTIA');
    expect(implicaciones(f.req, '125000,50')).toEqual([{ ref: 'ACTO.CUANTIA', rol: null, valor: '125000,50' }]);
  });

  it('DECLARE ARRAY: :REQ en cada subcampo y el rol en la lista', () => {
    const t = '{{DECLARE ARRAY COMPRADORES:REQ(@COMPRADOR) (NOMBRE:REQ(SUJETO.NOMBRE), ' +
      'NIF:[El NIF]:REQ(SUJETO.NUM_DOCUMENTO):DOC(REQ_DNI))}}';
    const f = uno(t);
    expect(f.name).toBe('COMPRADORES');
    expect(f.req).toEqual([expect.objectContaining({ ref: null, rol: 'COMPRADOR' })]);
    expect(f.arraySubfields.map((s) => s.name)).toEqual(['NOMBRE', 'NIF']);
    expect(f.arraySubfields[1].instruction).toBe('El NIF');
    expect(f.arraySubfieldsReqDoc.NIF.doc).toEqual(['REQ_DNI']);
    expect(codigos(t)).not.toContain('E906');

    const campo = esquemaDeCampos(t).campos.find((c) => c.nombre === 'COMPRADORES')!;
    expect(campo.subcampos.map((s) => [s.nombre, s.req[0]?.ref, s.req[0]?.rol])).toEqual([
      ['NOMBRE', 'SUJETO.NOMBRE', 'COMPRADOR'],
      ['NIF', 'SUJETO.NUM_DOCUMENTO', 'COMPRADOR'],
    ]);
  });

  it('el esquema de campos toma :REQ/:DOC de la declaración aunque el campo se pinte antes', () => {
    const t = 'Precio: {{PRECIO_VENTA}}\n{{DECLARE PRECIO_VENTA AS NUM:REQ(ACTO.CUANTIA):DOC(REQ_CONTRATO_ARRAS)}}';
    const c = esquemaDeCampos(t).campos.find((x) => x.nombre === 'PRECIO_VENTA')!;
    expect(c.req.map((r) => r.ref)).toEqual(['ACTO.CUANTIA']);
    expect(c.doc).toEqual(['REQ_CONTRATO_ARRAS']);
  });
});

describe('E906: :REQ / :DOC mal formados', () => {
  const casos: Array<[string, string]> = [
    ['hecho sin ámbito', '{{DECLARE X:REQ(ES_VPO)}}'],
    ['par sin =', '{{DECLARE X:OPTIONS(A,B):REQ(OBJETO.ES_VPO; A)}}'],
    ['par con lado vacío', '{{DECLARE X:REQ(OBJETO.ES_VPO; =TRUE)}}'],
    ['dos roles', '{{DECLARE X:REQ(SUJETO.TIPO@VENDEDOR@COMPRADOR)}}'],
    ['rol sin hecho con mapa', '{{DECLARE X:REQ(@VENDEDOR; A=B)}}'],
    ['DOC vacío', '{{DECLARE X:DOC()}}'],
    ['DOC con hueco', '{{DECLARE X:DOC(REQ_A | )}}'],
  ];
  for (const [nombre, t] of casos) {
    it(nombre, () => {
      expect(codigos(t)).toContain('E906');
      expect(uno(t).name).toBe('X');
    });
  }

  it('un :REQ sin cerrar avisa y no se come el resto', () => {
    const r = pelarReqDoc('DECLARE X:REQ(OBJETO.ES_VPO; A=B:[instr]');
    expect(r.errores).toHaveLength(1);
    expect(r.texto).toContain(':[instr]');
  });

  it('leerReq normaliza a mayúsculas el hecho y el rol, no los valores', () => {
    expect(leerReq('objeto.es_vpo@vendedor; Sí=true')).toMatchObject({
      ref: 'OBJETO.ES_VPO', rol: 'VENDEDOR', mapa: [['Sí', 'true']],
    });
  });
});

describe('normalizarValor', () => {
  it('booleanos, tildes, mayúsculas y espacios', () => {
    expect(normalizarValor('Sí')).toBe('TRUE');
    expect(normalizarValor('no')).toBe('FALSE');
    expect(normalizarValor('Elemento de División  Horizontal')).toBe('ELEMENTO_DE_DIVISION_HORIZONTAL');
    expect(normalizarValor('persona_fisica')).toBe(normalizarValor('Persona Física'));
  });
});
