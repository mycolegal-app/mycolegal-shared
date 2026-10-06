// F1.9 — `{{SCHEMA_ACT:xxxx}}` y los metadatos de esquema y párrafo
// (acto, `{{SUMMARY:…}}`, `{{LANG=xx}}`). Decidido por Carles el 6-oct-2026.
import { describe, it, expect } from 'vitest';
import {
  metadatosDeEsquema, metadatosDeParrafo, validateText, compose, parseFields, FieldType,
  esquemaDeCampos,
} from '../index';

const ESQUEMA = `{{SCHEMA_ACT:1104}}
{{SUMMARY:Renuncia pura y simple a la herencia}}
{{LANG=es}}
Ante mí, {{NOMBRE_NOTARIO}}, comparece {{RENUNCIANTE}}.`;

describe('metadatosDeEsquema', () => {
  it('lee acto, descripción e idioma', () => {
    expect(metadatosDeEsquema(ESQUEMA)).toEqual({
      actoCodigo: '1104',
      descripcion: 'Renuncia pura y simple a la herencia',
      idioma: 'es',
      errores: [],
    });
  });

  it('sin directivas: acto y descripción nulos, idioma por defecto', () => {
    expect(metadatosDeEsquema('Texto.')).toEqual({ actoCodigo: null, descripcion: null, idioma: 'es', errores: [] });
  });

  it('un código sin forma IUI es un error y no se devuelve', () => {
    const m = metadatosDeEsquema('{{SCHEMA_ACT:11a4}}');
    expect(m.actoCodigo).toBeNull();
    expect(m.errores[0]).toMatch(/cuatro dígitos/);
  });

  it('dos códigos distintos son un error; el mismo repetido, no', () => {
    expect(metadatosDeEsquema('{{SCHEMA_ACT:1104}}\n{{SCHEMA_ACT:0505}}').errores).toHaveLength(1);
    expect(metadatosDeEsquema('{{SCHEMA_ACT:1104}}\n{{SCHEMA_ACT:1104}}').actoCodigo).toBe('1104');
  });

  it('tolera espacios y un SUMMARY vacío cuenta como sin descripción', () => {
    const m = metadatosDeEsquema('{{ SCHEMA_ACT : 0505 }}\n{{SUMMARY:  }}');
    expect(m.actoCodigo).toBe('0505');
    expect(m.descripcion).toBeNull();
  });
});

describe('metadatosDeParrafo', () => {
  it('lee descripción e idioma', () => {
    expect(metadatosDeParrafo('{{SUMMARY:Cláusula de renuncia}}\n{{LANG=ca}}\nText.'))
      .toEqual({ descripcion: 'Cláusula de renuncia', idioma: 'ca', errores: [] });
  });

  it('un SCHEMA_ACT en un párrafo es un error', () => {
    expect(metadatosDeParrafo('{{SCHEMA_ACT:1104}}\nTexto.').errores[0]).toMatch(/sólo puede ir en un esquema/);
  });
});

describe('SCHEMA_ACT en el lenguaje', () => {
  it('se clasifica como directiva propia, no como campo', () => {
    const f = parseFields('{{SCHEMA_ACT:1104}}').find((x) => x.raw.includes('SCHEMA_ACT'));
    expect(f?.fieldType).toBe(FieldType.SCHEMA_ACT);
    expect(f?.name).toBe('1104');
  });

  it('sale 0 caracteres al componer, y no deja línea en blanco', () => {
    const r = compose('{{SCHEMA_ACT:1104}}\nTexto.', {});
    const texto = typeof r === 'string' ? r : (r as { text?: string; content?: string }).text ?? (r as { content?: string }).content ?? '';
    expect(texto).not.toMatch(/SCHEMA_ACT|1104/);
    expect(texto.startsWith('\n')).toBe(false);
  });

  it('no entra en el esquema de campos', () => {
    const e = esquemaDeCampos(ESQUEMA, {});
    expect(e.campos.map((c: { nombre: string }) => c.nombre)).not.toContain('SCHEMA_ACT:1104');
    expect(e.campos.some((c: { nombre: string }) => /SCHEMA_ACT/.test(c.nombre))).toBe(false);
  });

  it('el validador: E120 si el código no tiene forma IUI, W120 si se repite', () => {
    const malo = validateText('{{SCHEMA_ACT:11}}\nTexto.');
    expect(malo.diagnostics.some((d) => d.code === 'E120')).toBe(true);
    const doble = validateText('{{SCHEMA_ACT:1104}}\n{{SCHEMA_ACT:1104}}\nTexto.');
    expect(doble.diagnostics.some((d) => d.code === 'W120')).toBe(true);
    const bien = validateText(ESQUEMA);
    expect(bien.diagnostics.some((d) => d.code === 'E120' || d.code === 'W120')).toBe(false);
  });
});
