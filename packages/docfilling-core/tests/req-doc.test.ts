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
      ref: 'OBJETO.SUELO_URBANO_IIVTNU', ambito: 'OBJETO', codigo: 'SUELO_URBANO_IIVTNU', campo: null, rol: null,
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
    const f = uno('{{DECLARE PRECIO_VENTA AS NUM:[Extrae el precio de venta global]:REQ(ACTO.PRECIO)}}');
    expect(f.req[0].codigo).toBe('PRECIO');
    expect(implicaciones(f.req, '125000,50')).toEqual([{ ref: 'ACTO.PRECIO', rol: null, valor: '125000,50' }]);
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
    const t = 'Precio: {{PRECIO_VENTA}}\n{{DECLARE PRECIO_VENTA AS NUM:REQ(ACTO.PRECIO):DOC(REQ_CONTRATO_ARRAS)}}';
    const c = esquemaDeCampos(t).campos.find((x) => x.nombre === 'PRECIO_VENTA')!;
    expect(c.req.map((r) => r.ref)).toEqual(['ACTO.PRECIO']);
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

import { readFileSync } from 'node:fs';
import { catalogoDesdeJson } from '../src/ports/catalogo';

describe(':REQ / :DOC contra el catálogo (W907, W908, W909, W912)', () => {
  const catalogo = catalogoDesdeJson(
    JSON.parse(readFileSync(new URL('./fixtures/catalogo_req.prueba.json', import.meta.url), 'utf8')),
  );
  const conCatalogo = (t: string) => validateText(t, undefined, undefined, { catalogo }).diagnostics
    .filter((d) => /^W90[7-9]|^W912/.test(d.code)).map((d) => d.code);

  it('sin catálogo no se emite ninguno', () => {
    expect(codigos('{{DECLARE X:REQ(OBJETO.NO_EXISTE):DOC(REQ_NO_EXISTE)}}').filter((c) => /^W9(0[7-9]|12)/.test(c))).toEqual([]);
  });

  it('los ejemplos bien escritos no avisan', () => {
    expect(conCatalogo('{{DECLARE TIPO_FINCA:OPTIONS(Urbana,Rústica):REQ(OBJETO.SUELO_URBANO_IIVTNU; Urbana=TRUE; Rústica=FALSE):DOC(REQ_NOTA_SIMPLE)}}')).toEqual([]);
    expect(conCatalogo('{{DECLARE ESTRUCTURA_VENDEDORA:OPTIONS(Matrimonio,Sociedad):REQ(SUJETO.TIPO@VENDEDOR; Matrimonio=PERSONA_FISICA; Sociedad=PERSONA_JURIDICA):REQ(SUJETO.ESTADO_CIVIL@VENDEDOR; Matrimonio=CASADO)}}')).toEqual([]);
    expect(conCatalogo('{{DECLARE FINCA_ES_VPO AS BOOL:REQ(OBJETO.ES_VPO)}}')).toEqual([]);
    expect(conCatalogo('{{DECLARE ALERTA:OPTIONS(Sí,No):REQ(OBJETO.ES_VPO; Sí=TRUE)}}')).toEqual([]);
  });

  it('W907: hecho que no existe', () => {
    expect(conCatalogo('{{DECLARE X:REQ(OBJETO.NO_EXISTE)}}')).toEqual(['W907']);
  });

  it('W908: valor del mapa fuera del campo o del hecho, y sin mapa con opciones que no casan', () => {
    expect(conCatalogo('{{DECLARE X:OPTIONS(Urbana,Rústica):REQ(OBJETO.SUELO_URBANO_IIVTNU; Urbano=TRUE)}}')).toEqual(['W908']);
    expect(conCatalogo('{{DECLARE X:OPTIONS(A,B):REQ(SUJETO.ESTADO_CIVIL; A=CASADA)}}')).toEqual(['W908']);
    expect(conCatalogo('{{DECLARE X:OPTIONS(Soltero,Pareja estable):REQ(SUJETO.ESTADO_CIVIL)}}')).toEqual(['W908']);
  });

  it('W909: rol desconocido; @* no avisa', () => {
    expect(conCatalogo('{{DECLARE X:REQ(SUJETO.NOMBRE@VENDEDORA)}}')).toEqual(['W909']);
    expect(conCatalogo('{{DECLARE X:REQ(SUJETO.NOMBRE@*)}}')).toEqual([]);
  });

  it('W912: tipo de documento desconocido, también en subcampos', () => {
    expect(conCatalogo('{{DECLARE ARRAY C:REQ(@COMPRADOR) (NOMBRE:REQ(SUJETO.NOMBRE):DOC(REQ_PASAPORTE_X))}}')).toEqual(['W912']);
  });
});

import { analizarBiblioteca } from '../src/biblioteca/analizar';
import { enlacesDeEsquema } from '../src/biblioteca/enlaces';

describe('biblioteca: declaraciones divergentes (F2.4) y enlaces de un esquema (W910/W911)', () => {
  it('el mismo campo con distinto :REQ, :DOC o valor por defecto en dos VAR', async () => {
    const a = await analizarBiblioteca([
      { nombre: 'VAR_A', texto: '{{DECLARE LIMITACION_DEFENSA:INPUT(¿Incluir la advertencia?|Sí,No)=Sí}}' },
      { nombre: 'VAR_B', texto: '{{DECLARE LIMITACION_DEFENSA:INPUT(¿Incluir la advertencia?|Sí,No)=No}}' },
      { nombre: 'VAR_C', texto: '{{DECLARE TIPO_FINCA:OPTIONS(Urbana,Rústica):REQ(OBJETO.SUELO_URBANO_IIVTNU; Urbana=TRUE; Rústica=FALSE)}}' },
      { nombre: 'VAR_D', texto: '{{DECLARE TIPO_FINCA:OPTIONS(Urbana,Rústica):REQ(OBJETO.SUELO_URBANO_IIVTNU; Rústica=FALSE; urbana=true)}}' },
      { nombre: 'VAR_E', texto: '{{DECLARE ES_VPO AS BOOL:REQ(OBJETO.ES_VPO):DOC(REQ_NOTA_SIMPLE)}}' },
      { nombre: 'VAR_F', texto: '{{DECLARE ES_VPO AS BOOL:REQ(OBJETO.ES_VPO)}}' },
    ]);
    // El orden del mapa y las mayúsculas no cuentan: TIPO_FINCA no diverge.
    expect(a.declaracionesDivergentes.map((d) => d.nombre)).toEqual(['ES_VPO', 'LIMITACION_DEFENSA']);
  });

  it('cuenta condiciones y datos, y marca las condiciones sin pregunta ni fuente', () => {
    const t = [
      '{{DECLARE TIPO_FINCA:OPTIONS(Urbana,Rústica):REQ(OBJETO.SUELO_URBANO_IIVTNU; Urbana=TRUE; Rústica=FALSE):DOC(REQ_NOTA_SIMPLE)}}',
      '{{DECLARE LIMITACION:INPUT(¿Incluir la advertencia?|Sí,No)=No}}',
      '{{DECLARE HUERFANA AS BOOL:[Analiza la nota simple]}}',
      '{{DECLARE PRECIO AS NUM:REQ(ACTO.PRECIO)}}',
      '{{IF TIPO_FINCA == "Urbana" AND HUERFANA}}urbana{{ENDIF}}{{IF LIMITACION == "Sí"}}aviso{{ENDIF}}',
      'Precio: {{PRECIO}} euros. {{FECHA}}',
    ].join('\n');
    const e = enlacesDeEsquema(t);
    expect(e.resumen).toEqual({
      condiciones: 3, datos: 1, condicionesConReq: 1, condicionesConDoc: 1, condicionesConInput: 1,
      datosConReq: 1, sinPregunta: 1, sinFuente: 1,
    });
    expect(e.campos.filter((c) => c.sinPregunta).map((c) => c.nombre)).toEqual(['HUERFANA']);
  });
});

import { camposSoloCondicionales } from '../src/fields/conditional-only';

describe('F2.5: las variables de un IF se leen una a una', () => {
  const ctx = { camposDeSistema: new Set<string>(['COMUNIDAD_AUTONOMA']), camposPredefinidos: new Set<string>() };
  it('IF A AND B, IN (…), COUNT(…) y SYSTEM:', () => {
    const t = `{{IF A AND NOT B == "x"}}.{{ENDIF}}{{IF C IN ('1. uno', '2. dos')}}.{{ENDIF}}` +
      '{{IF COUNT(FINCAS) > 1}}.{{ENDIF}}{{IF SYSTEM:COMUNIDAD_AUTONOMA == "Cataluña"}}.{{ENDIF}}';
    expect([...camposSoloCondicionales(t, ctx)].sort()).toEqual(['A', 'B', 'C', 'FINCAS']);
  });
});

describe('enlaces: las constantes del autor no son condiciones', () => {
  it('DECLARE X=v y SET no cuentan', () => {
    const e = enlacesDeEsquema('{{DECLARE ES_PH=TRUE}}{{SET MODO=a}}{{IF ES_PH}}.{{ENDIF}}{{IF MODO == "a"}}.{{ENDIF}}');
    expect(e.resumen.condiciones).toBe(0);
  });
});

import { pesoDeCondiciones, puntuacion } from '../src/fields/peso';

describe('F2.6: peso de las condiciones', () => {
  it('cuenta el texto visible del bloque más externo y las condiciones que tumba', () => {
    const t = [
      '{{IF CCAA == "Cataluña"}}Texto catalán.',
      '{{IF BONIF_A}}Bonificación A.{{ENDIF}}',
      '{{IF BONIF_B}}Bonificación B.{{ELSE}}Sin B.{{ENDIF}}',
      '{{IF CCAA == "Cataluña" AND BONIF_A}}Repetido.{{ENDIF}}',
      '{{ENDIF}}',
      '{{IF_VPO}}{{DECLARE X=1}}Es VPO.{{ENDIF_VPO}}',
    ].join('');
    const p = pesoDeCondiciones(t);
    const dentroCcaa = 'Texto catalán.Bonificación A.Bonificación B.Sin B.Repetido.'.length;
    expect(p.get('CCAA')).toEqual({ caracteres: dentroCcaa, bloques: 1, tumba: ['BONIF_A', 'BONIF_B'] });
    // BONIF_A gobierna dos bloques hermanos; ninguno dentro de otro suyo.
    expect(p.get('BONIF_A')?.bloques).toBe(2);
    expect(p.get('BONIF_A')?.caracteres).toBe('Bonificación A.'.length + 'Repetido.'.length);
    // Las directivas no cuentan como texto, y la forma IF_X también vale.
    expect(p.get('VPO')?.caracteres).toBe('Es VPO.'.length);
    expect(puntuacion(p.get('CCAA'))).toBeGreaterThan(puntuacion(p.get('BONIF_B')));
  });

  it('un IF sin cerrar no rompe la cuenta', () => {
    expect(pesoDeCondiciones('{{IF A}}abc').get('A')?.caracteres).toBe(3);
  });
});

describe(':REQ de tres segmentos: un componente de una LISTA o una DIRECCION', () => {
  const catalogo = catalogoDesdeJson(
    JSON.parse(readFileSync(new URL('./fixtures/catalogo_req.prueba.json', import.meta.url), 'utf8')),
  );
  const conCatalogo = (t: string) => validateText(t, undefined, undefined, { catalogo }).diagnostics
    .filter((d) => /^W90[7-9]|^W912|^E906/.test(d.code)).map((d) => d.code);

  it('se lee con su componente, y en los subcampos de un ARRAY', () => {
    const t = '{{DECLARE ARRAY PAGOS:REQ(ACTO.PAGOS) (IMPORTE AS NUM:REQ(ACTO.PAGOS.CUANTIA), ' +
      'MEDIO:REQ(ACTO.PAGOS.MEDIO; Transferencia=TRANSFERENCIA))}}';
    const [f] = parseFields(t);
    expect(f.req[0]).toMatchObject({ ref: 'ACTO.PAGOS', codigo: 'PAGOS', campo: null });
    expect(f.arraySubfieldsReqDoc.IMPORTE.req[0]).toMatchObject({ ref: 'ACTO.PAGOS.CUANTIA', codigo: 'PAGOS', campo: 'CUANTIA' });
    expect(conCatalogo(t)).toEqual([]);
  });

  it('el puerto presenta el componente como un atributo, con su tipo y sus opciones', () => {
    expect(catalogo.atributo('ACTO.PAGOS.MEDIO')).toMatchObject({ ref: 'ACTO.PAGOS.MEDIO', tipoDato: 'ENUM', clase: 'DATO' });
    expect(catalogo.atributo('SUJETO.DOMICILIO.VIA')?.iui?.ruta).toBe('VIA');
    expect(catalogo.atributo('ACTO.PAGOS.NO_EXISTE')).toBeUndefined();
  });

  it('W907 si el componente no existe; W908 si el valor no está en sus opciones', () => {
    expect(conCatalogo('{{DECLARE X:REQ(ACTO.PAGOS.NO_EXISTE)}}')).toEqual(['W907']);
    expect(conCatalogo('{{DECLARE X:OPTIONS(Bizum):REQ(ACTO.PAGOS.MEDIO; Bizum=BIZUM)}}')).toEqual(['W908']);
  });

  it('cuatro segmentos no son válidos (E906)', () => {
    expect(conCatalogo('{{DECLARE X:REQ(ACTO.PAGOS.MEDIO.OTRO)}}')).toEqual(['E906']);
  });
});

describe(':[instrucción] y :INPUT(…) en cualquier orden (9-oct)', () => {
  it('la instrucción delante no se come la pregunta (TIPO_FINCA_PH de _PROD)', () => {
    const t = '{{DECLARE TIPO_FINCA_PH:[Seleccione si la finca es suelo o elemento]:INPUT(Tipo de Finca a efectos de Catastro|Suelo o Parcela,Elemento de División Horizontal)}}';
    const f = uno(t);
    expect(f.inputDescription).toBe('Tipo de Finca a efectos de Catastro');
    expect(f.inputOptions).toEqual(['Suelo o Parcela', 'Elemento de División Horizontal']);
    expect(f.declareInstruction).toBe('Seleccione si la finca es suelo o elemento');
    expect(codigos(t)).not.toContain('W055');
  });
  it('y detrás tampoco se pierde', () => {
    const f = uno('{{DECLARE X:INPUT(¿Pregunta [con corchetes]?|A,B)=A:[instr]}}');
    expect(f.inputDescription).toBe('¿Pregunta [con corchetes]?');
    expect(f.inputDefault).toBe('A');
    expect(f.declareInstruction).toBe('instr');
  });
});
