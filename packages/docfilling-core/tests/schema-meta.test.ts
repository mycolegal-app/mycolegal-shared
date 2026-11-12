// `{{SCHEMA:CLAVE=valor}}`: lo que el esquema declara de sí mismo (Carles, 12-nov-2026). Ver `src/syntax/schema-meta.ts`.
import { describe, it, expect } from 'vitest';
import {
  compose, validateText, metadatosDeEsquema, metadatosDeParrafo, leerSchema, valoresDeSchema, condicionTriestado,
  esquemaDeCampos, camposSoloCondicionales, applyFieldSuffix, resolverDeclarados, idiomaDePlantilla,
  cambiarIdiomaDePlantilla, comparacionesSchema, processConditionals,
} from '../index';

const CABECERA = `{{SCHEMA:ACT=1103 ALIAS ADJUDICACION_HERENCIA}}
{{SCHEMA:FAMILY=F11 ALIAS HERENCIAS}}
{{SCHEMA:GROUP=TRANSMISION_GRATUITA, MORTIS_CAUSA}}
{{SCHEMA:LANG=es}}
`;
const COMPRAVENTA = `{{SCHEMA:ACT=0501 ALIAS COMPRAVENTA}}
{{SCHEMA:FAMILY=F05 ALIAS COMPRAVENTAS}}
{{SCHEMA:VARIANT=ARRAS}}
{{SCHEMA:GROUP=TRANSMISION_ONEROSA}}
`;

const sale = (cabecera: string, cuerpo: string, valores: Record<string, unknown> = {}, locale?: string) =>
  compose(cabecera + cuerpo, valores, locale).trim();
const si = (cabecera: string, cond: string, valores: Record<string, unknown> = {}) =>
  sale(cabecera, `{{IF ${cond}}}SI{{ELSE}}NO{{ENDIF}}`, valores);

describe('declarar', () => {
  it('lee código, alias, familia, variante, grupos e idioma', () => {
    expect(leerSchema(CABECERA)).toEqual({
      act: '1103', actAlias: 'ADJUDICACION_HERENCIA', family: 'F11', familyAlias: 'HERENCIAS',
      variant: '', groups: ['TRANSMISION_GRATUITA', 'MORTIS_CAUSA'], lang: 'es',
    });
  });

  it('las declaraciones salen 0 caracteres, y no dejan línea en blanco', () => {
    expect(compose(CABECERA + 'Texto.', {})).toBe('Texto.');
  });

  it('la forma retirada (SCHEMA_ACT, LANG=) no declara nada', () => {
    const m = leerSchema('{{SCHEMA_ACT:1104}}\n{{LANG=ca}}');
    expect(m.act).toBe('');
    expect(m.lang).toBe('');
    expect(si('{{SCHEMA_ACT:1104}}\n', 'SCHEMA:ACT == "1104"')).toBe('NO');
  });
});

describe('leer en un IF', () => {
  it('ACT casa con el código o con el alias', () => {
    expect(si(CABECERA, 'SCHEMA:ACT == "1103"')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:ACT == "ADJUDICACION_HERENCIA"')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:ACT != "ADJUDICACION_HERENCIA"')).toBe('NO');
    expect(si(CABECERA, 'SCHEMA:ACT == "COMPRAVENTA"')).toBe('NO');
    expect(si(CABECERA, 'SCHEMA:ACT IN ("0501", "ADJUDICACION_HERENCIA")')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:ACT NOT IN ("0501", "1103")')).toBe('NO');
  });

  it('FAMILY igual: la SEXTA de plusvalía no depende de VAR_HAY_INMUEBLES en una compraventa', () => {
    const cond = 'SCHEMA:FAMILY != "HERENCIAS" OR VAR_HAY_INMUEBLES';
    expect(si(COMPRAVENTA, cond, { VAR_HAY_INMUEBLES: 'No' })).toBe('SI');
    expect(si(CABECERA, cond, { VAR_HAY_INMUEBLES: 'No' })).toBe('NO');
    expect(si(CABECERA, cond, { VAR_HAY_INMUEBLES: 'Sí' })).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:FAMILY == "F11"')).toBe('SI');
  });

  it('VARIANT vacía si no se declara: == es falso y != es verdadero', () => {
    expect(si(CABECERA, 'SCHEMA:VARIANT == "ARRAS"')).toBe('NO');
    expect(si(CABECERA, 'SCHEMA:VARIANT != "ARRAS"')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:VARIANT')).toBe('NO');
    expect(si(COMPRAVENTA, 'SCHEMA:ACT == "COMPRAVENTA" AND SCHEMA:VARIANT != "ARRAS"')).toBe('NO');
    expect(si(COMPRAVENTA, 'SCHEMA:ACT == "COMPRAVENTA" AND SCHEMA:VARIANT == "ARRAS"')).toBe('SI');
  });

  it('GROUP es pertenencia: ==, !=, IN, NOT IN', () => {
    expect(si(CABECERA, 'SCHEMA:GROUP == "TRANSMISION_GRATUITA"')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:GROUP == "MORTIS_CAUSA"')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:GROUP != "MORTIS_CAUSA"')).toBe('NO');
    expect(si(CABECERA, 'SCHEMA:GROUP == "TRANSMISION_ONEROSA"')).toBe('NO');
    expect(si(CABECERA, 'SCHEMA:GROUP IN ("TRANSMISION_ONEROSA", "MORTIS_CAUSA")')).toBe('SI');
    expect(si(CABECERA, 'SCHEMA:GROUP NOT IN ("TRANSMISION_ONEROSA", "MORTIS_CAUSA")')).toBe('NO');
    expect(si(COMPRAVENTA, 'NOT (SCHEMA:GROUP == "TRANSMISION_GRATUITA")')).toBe('SI');
  });

  it('LANG es la lengua del documento: la declarada, o la de destino al traducir', () => {
    expect(si(CABECERA, 'SCHEMA:LANG == "es"')).toBe('SI');
    expect(si(cambiarIdiomaDePlantilla(CABECERA, 'ca'), 'SCHEMA:LANG == "ca"')).toBe('SI');
    // Sin declarar, la del motor (castellano por defecto).
    expect(si('', 'SCHEMA:LANG == "es"')).toBe('SI');
  });

  it('un dato del caso con el mismo nombre no pisa los metadatos', () => {
    expect(si(CABECERA, 'SCHEMA:ACT == "1103"', { 'SCHEMA:ACT': '0501' })).toBe('SI');
  });

  it('dentro de un FOR EACH también', () => {
    const t = CABECERA + '{{FOR EACH P IN PERSONAS}}{{IF SCHEMA:GROUP == "MORTIS_CAUSA"}}{{P.NOMBRE}};{{ENDIF}}{{ENDFOR}}';
    expect(compose(t, { PERSONAS: [{ NOMBRE: 'Ana' }, { NOMBRE: 'Luis' }] }).trim()).toBe('Ana;Luis;');
  });
});

describe('imprimir', () => {
  it('{{SCHEMA:ACT}} saca el código; GROUP, la lista', () => {
    expect(sale(CABECERA, '{{SCHEMA:ACT}} {{SCHEMA:FAMILY}} {{SCHEMA:LANG}} [{{SCHEMA:VARIANT}}] {{SCHEMA:GROUP}}'))
      .toBe('1103 F11 es [] TRANSMISION_GRATUITA, MORTIS_CAUSA');
  });
});

describe('el valor es el del ESQUEMA RAÍZ, también desde un párrafo incluido', () => {
  it('el sufijo de un INCLUDE no renombra SCHEMA:', () => {
    const p = '{{IF SCHEMA:GROUP == "X" AND A}}{{SCHEMA:ACT}}{{ENDIF}}';
    expect(applyFieldSuffix(p, '_VEND')).toBe('{{IF SCHEMA:GROUP == "X" AND A_VEND}}{{SCHEMA:ACT}}{{ENDIF}}');
  });
});

describe('son CONSTANTES', () => {
  it('nunca son campo ni pregunta', () => {
    const t = COMPRAVENTA + '{{IF SCHEMA:FAMILY != "HERENCIAS" OR VAR_HAY_INMUEBLES}}x{{ENDIF}} {{SCHEMA:ACT}}';
    const nombres = esquemaDeCampos(t).campos.map((c) => c.nombre);
    expect(nombres.some((n) => /SCHEMA/i.test(n))).toBe(false);
    const condicionales = [...camposSoloCondicionales(t, { camposDeSistema: new Set(), camposPredefinidos: new Set() })];
    expect(condicionales).toContain('VAR_HAY_INMUEBLES');
    expect(condicionales.some((n) => /SCHEMA/i.test(n))).toBe(false);
  });

  it('condicionTriestado los da por sabidos: en una compraventa VAR_HAY_INMUEBLES ya no hace falta', () => {
    const r = condicionTriestado('SCHEMA:FAMILY != "HERENCIAS" OR VAR_HAY_INMUEBLES', valoresDeSchema(COMPRAVENTA), (c) => c === 'VAR_HAY_INMUEBLES');
    expect(r).toEqual({ valor: true, faltan: [] });
    const h = condicionTriestado('SCHEMA:FAMILY != "HERENCIAS" OR VAR_HAY_INMUEBLES', valoresDeSchema(CABECERA), (c) => c === 'VAR_HAY_INMUEBLES');
    expect(h).toEqual({ valor: null, faltan: ['VAR_HAY_INMUEBLES'] });
  });

  it('resolverDeclarados ve las ramas de SCHEMA:', () => {
    const t = CABECERA + '{{IF SCHEMA:GROUP == "MORTIS_CAUSA"}}{{DECLARE X=herencia}}{{ELSE}}{{DECLARE X=otro}}{{ENDIF}}';
    expect(resolverDeclarados(t, {})).toEqual({ X: 'herencia' });
  });

  it('processConditionals los lee del propio texto si no vienen en los valores', () => {
    expect(processConditionals(COMPRAVENTA + '{{IF SCHEMA:VARIANT == "ARRAS"}}A{{ENDIF}}', {}).endsWith('\nA')).toBe(true);
  });
});

describe('validador', () => {
  const codigos = (t: string, tipo?: 'esquema' | 'parrafo') => validateText(t, undefined, undefined, { tipo }).diagnostics.map((d) => d.code);

  it('un esquema bien declarado y usado no da nada de SCHEMA', () => {
    const c = codigos(CABECERA + '{{IF SCHEMA:GROUP == "TRANSMISION_GRATUITA"}}a{{ENDIF}}{{IF SCHEMA:ACT IN ("0501","COMPRAVENTA")}}b{{ENDIF}}{{SCHEMA:ACT}}', 'esquema');
    expect(c.filter((x) => /^(E92|W920|E013|W056)/.test(x))).toEqual([]);
  });

  it('E920 clave desconocida, declarada o leída', () => {
    expect(codigos('{{SCHEMA:FOO=X}}')).toContain('E920');
    expect(codigos('{{IF SCHEMA:FOO == "X"}}a{{ENDIF}}')).toContain('E920');
    expect(codigos('{{SCHEMA:FOO}}')).toContain('E920');
  });

  it('E921 un párrafo declara SCHEMA:; leerlo en un párrafo suelto no es error', () => {
    expect(codigos('{{SCHEMA:ACT=1103}}', 'parrafo')).toContain('E921');
    const c = codigos('{{IF SCHEMA:GROUP == "X"}}a{{ENDIF}}{{SCHEMA:ACT}}', 'parrafo');
    expect(c.filter((x) => /^(E9|W056|E013)/.test(x))).toEqual([]);
  });

  it('E922 clave repetida', () => {
    expect(codigos('{{SCHEMA:ACT=1103}}\n{{SCHEMA:ACT=1103}}')).toContain('E922');
    expect(codigos('{{SCHEMA:GROUP=A}}\n{{SCHEMA:GROUP=B}}')).toContain('E922');
  });

  it('E923 formato malo', () => {
    for (const d of ['{{SCHEMA:ACT=113}}', '{{SCHEMA:ACT=1103 ALIAS adjudicacion}}', '{{SCHEMA:FAMILY=11}}',
      '{{SCHEMA:FAMILY=F11 ALIAS HERENCIÁS}}', '{{SCHEMA:VARIANT=CON ARRAS}}', '{{SCHEMA:GROUP=A, b}}', '{{SCHEMA:VARIANT=A,B}}']) {
      expect(codigos(d), d).toContain('E923');
    }
  });

  it('E924 comparar ACT con algo que no es ni código ni alias', () => {
    expect(codigos('{{IF SCHEMA:ACT == "11"}}a{{ENDIF}}')).toContain('E924');
    expect(codigos('{{IF SCHEMA:ACT == "Compraventa"}}a{{ENDIF}}')).toContain('E924');
    expect(codigos('{{IF SCHEMA:ACT IN ("0501", "compra venta")}}a{{ENDIF}}')).toContain('E924');
    expect(codigos('{{IF SCHEMA:ACT == "0501"}}a{{ENDIF}}')).not.toContain('E924');
  });

  it('E925 DECLARE o SET sobre SCHEMA:', () => {
    expect(codigos('{{DECLARE SCHEMA:ACT=1103}}')).toContain('E925');
    expect(codigos('{{SET SCHEMA:GROUP=X}}')).toContain('E925');
  });

  it('E926 la forma retirada, en esquemas y párrafos', () => {
    expect(codigos('{{SCHEMA_ACT:1103}}\n{{LANG=es}}').filter((x) => x === 'E926')).toHaveLength(2);
    expect(codigos('{{LANG=ca}}', 'parrafo')).toContain('E926');
  });
});

describe('metadatos para la carga', () => {
  it('acto e idioma salen de SCHEMA:, con alias, familia y grupos', () => {
    const m = metadatosDeEsquema(CABECERA);
    expect(m.actoCodigo).toBe('1103');
    expect(m.idioma).toBe('es');
    expect(m.schema.familyAlias).toBe('HERENCIAS');
    expect(m.errores).toEqual([]);
  });

  it('la forma retirada no carga: no da acto ni idioma y es error', () => {
    const m = metadatosDeEsquema('{{SCHEMA_ACT:1104}}\n{{LANG=ca}}');
    expect(m.actoCodigo).toBeNull();
    expect(m.idioma).toBe('es');
    expect(m.errores.filter((e) => /forma retirada/.test(e))).toHaveLength(2);
  });

  it('un párrafo no declara SCHEMA:', () => {
    expect(metadatosDeParrafo('{{SCHEMA:GROUP=X}}').errores).toHaveLength(1);
    expect(metadatosDeParrafo('Text.').errores).toEqual([]);
  });

  it('idiomaDePlantilla y la traducción: sólo SCHEMA:LANG', () => {
    expect(idiomaDePlantilla('{{SCHEMA:LANG=ca}}')).toBe('ca');
    expect(idiomaDePlantilla('{{LANG=ca}}')).toBe('es');
    expect(cambiarIdiomaDePlantilla('{{SCHEMA:LANG=es}}', 'ca')).toBe('{{SCHEMA:LANG=ca}}');
  });

  it('comparacionesSchema da los literales que comparan las condiciones', () => {
    expect(comparacionesSchema('{{IF SCHEMA:ACT == "0501" OR SCHEMA:GROUP IN ("A", \'B\')}}x{{ENDIF}}')).toEqual([
      { clave: 'ACT', literal: '0501' }, { clave: 'GROUP', literal: 'A' }, { clave: 'GROUP', literal: 'B' },
    ]);
  });
});
