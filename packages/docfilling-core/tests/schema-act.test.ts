// F1.9 — `{{SCHEMA:ACT=xxxx}}` y los metadatos de esquema y párrafo
// (acto, `{{SUMMARY:…}}`, `{{SCHEMA:LANG=xx}}`). Decidido por Carles el 6-oct-2026.
import { describe, it, expect } from 'vitest';
import {
  metadatosDeEsquema, metadatosDeParrafo, validateText, compose, parseFields, FieldType,
  esquemaDeCampos, camposSoloCondicionales,
} from '../index';

const ESQUEMA = `{{SCHEMA:ACT=1104}}
{{SUMMARY:Renuncia pura y simple a la herencia}}
{{SCHEMA:LANG=es}}
Ante mí, {{NOMBRE_NOTARIO}}, comparece {{RENUNCIANTE}}.`;

describe('metadatosDeEsquema', () => {
  it('lee acto, descripción e idioma', () => {
    expect(metadatosDeEsquema(ESQUEMA)).toMatchObject({
      actoCodigo: '1104',
      descripcion: 'Renuncia pura y simple a la herencia',
      idioma: 'es',
      errores: [],
    });
  });

  it('sin directivas: acto y descripción nulos, idioma por defecto', () => {
    expect(metadatosDeEsquema('Texto.')).toMatchObject({ actoCodigo: null, descripcion: null, idioma: 'es', errores: [] });
  });

  it('un código sin forma IUI es un error y no se devuelve', () => {
    const m = metadatosDeEsquema('{{SCHEMA:ACT=11a4}}');
    expect(m.actoCodigo).toBeNull();
    expect(m.errores[0]).toMatch(/cuatro cifras/);
  });

  it('dos códigos distintos son un error; el mismo repetido, no', () => {
    expect(metadatosDeEsquema('{{SCHEMA:ACT=1104}}\n{{SCHEMA:ACT=0505}}').errores).toHaveLength(1);
    expect(metadatosDeEsquema('{{SCHEMA:ACT=1104}}\n{{SCHEMA:ACT=1104}}').actoCodigo).toBe('1104');
  });

  it('tolera espacios y un SUMMARY vacío cuenta como sin descripción', () => {
    const m = metadatosDeEsquema('{{ SCHEMA:ACT = 0505 }}\n{{SUMMARY:  }}');
    expect(m.actoCodigo).toBe('0505');
    expect(m.descripcion).toBeNull();
  });
});

describe('metadatosDeParrafo', () => {
  it('lee la descripción; el idioma no lo declara un párrafo', () => {
    expect(metadatosDeParrafo('{{SUMMARY:Cláusula de renuncia}}\nText.'))
      .toEqual({ descripcion: 'Cláusula de renuncia', idioma: 'es', errores: [] });
  });

  it('un SCHEMA:ACT en un párrafo es un error', () => {
    expect(metadatosDeParrafo('{{SCHEMA:ACT=1104}}\nTexto.').errores[0]).toMatch(/sólo puede declararse en un esquema/);
  });

  it('la forma retirada en un párrafo, también', () => {
    expect(metadatosDeParrafo('{{LANG=ca}}\nText.').errores[0]).toMatch(/forma retirada/);
  });
});

describe('SCHEMA:ACT en el lenguaje', () => {
  it('sale 0 caracteres al componer, y no deja línea en blanco', () => {
    const r = compose('{{SCHEMA:ACT=1104}}\nTexto.', {});
    expect(r).not.toMatch(/SCHEMA|1104/);
    expect(r.startsWith('\n')).toBe(false);
  });

  it('no entra en el esquema de campos', () => {
    const e = esquemaDeCampos(ESQUEMA, {});
    expect(e.campos.some((c: { nombre: string }) => /SCHEMA/.test(c.nombre))).toBe(false);
  });

  it('el validador: E923 si el código no tiene forma IUI, E922 si se repite', () => {
    expect(validateText('{{SCHEMA:ACT=11}}\nTexto.').diagnostics.some((d) => d.code === 'E923')).toBe(true);
    expect(validateText('{{SCHEMA:ACT=1104}}\n{{SCHEMA:ACT=1104}}\nTexto.').diagnostics.some((d) => d.code === 'E922')).toBe(true);
    expect(validateText(ESQUEMA).diagnostics.some((d) => d.code.startsWith('E92'))).toBe(false);
  });
});

describe('la forma retirada {{SCHEMA_ACT:…}} (12-nov-2026, sin compatibilidad)', () => {
  it('no declara nada y es error E926, pero no sale impresa', () => {
    expect(metadatosDeEsquema('{{SCHEMA_ACT:1104}}').actoCodigo).toBeNull();
    expect(metadatosDeEsquema('{{SCHEMA_ACT:1104}}').errores[0]).toMatch(/forma retirada/);
    expect(validateText('{{SCHEMA_ACT:1104}}\nTexto.').diagnostics.some((d) => d.code === 'E926')).toBe(true);
    expect(compose('{{SCHEMA_ACT:1104}}\nTexto.', {})).toBe('Texto.');
  });
});

// F5.22 (6-oct-2026): un campo que se PINTA no puede ser «sólo condicional»,
// aunque su nombre contenga `IF_` (NIF_, CIF_) o su instrucción diga «el NIF del…».
describe('camposSoloCondicionales: la palabra condicional abre la directiva', () => {
  it('PJ_NIF_VEND se pinta y por tanto se pregunta', () => {
    const t = '{{DECLARE PJ_NIF_VEND:[NIF de la entidad.]}}\n{{IF PJ_NIF_VEND}}con NIF {{PJ_NIF_VEND}}{{ENDIF}}';
    const c = esquemaDeCampos(t, {}).campos.find((x: { nombre: string }) => x.nombre === 'PJ_NIF_VEND');
    expect(c?.soloCondicional).toBe(false);
  });
  it('una instrucción que menciona «el NIF del» sigue contando como pintado', () => {
    const t = '{{IF X}}a{{ENDIF}} {{X:[Extrae el NIF del vendedor]}}';
    const c = esquemaDeCampos(t, {}).campos.find((x: { nombre: string }) => x.nombre === 'X');
    expect(c?.soloCondicional).toBe(false);
  });
  it('un campo sólo en condiciones sigue siendo sólo condicional', () => {
    const t = '{{IF HAY_HIPOTECA}}Con hipoteca.{{ELSE}}Libre.{{ENDIF}} Precio {{PRECIO}}.';
    const solo = camposSoloCondicionales(t, { camposDeSistema: new Set(), camposPredefinidos: new Set() });
    expect(solo.has('HAY_HIPOTECA')).toBe(true);
    expect(solo.has('PRECIO')).toBe(false);
  });
});
