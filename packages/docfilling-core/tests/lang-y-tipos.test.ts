// `{{LANG=xx}}` (residuo de F1.3) e inferencia de tipo por nombre (F1.7).
import { describe, it, expect } from 'vitest';
import { idiomaDePlantilla, IDIOMA_POR_DEFECTO, inferirTipoDeNombre } from '../index';

describe('idiomaDePlantilla', () => {
  it('lee la directiva y normaliza a minúsculas', () => {
    expect(idiomaDePlantilla('{{LANG=CA}}\nText.')).toBe('ca');
    expect(idiomaDePlantilla('{{ LANG = ca }}')).toBe('ca');
  });

  it('sin directiva, castellano', () => {
    expect(idiomaDePlantilla('Texto sin nada.')).toBe(IDIOMA_POR_DEFECTO);
    expect(idiomaDePlantilla('Texto.', 'ca')).toBe('ca');
  });

  it('se queda con la primera cuando hay dos', () => {
    expect(idiomaDePlantilla('{{LANG=ca}}\n{{LANG=eu}}')).toBe('ca');
  });

  it('una directiva mal escrita no cuenta', () => {
    expect(idiomaDePlantilla('{{LANG=}}')).toBe(IDIOMA_POR_DEFECTO);
    expect(idiomaDePlantilla('{{LANG 3}}')).toBe(IDIOMA_POR_DEFECTO);
  });
});

describe('inferirTipoDeNombre', () => {
  it('deduce el tipo de los nombres que siguen la convención', () => {
    expect(inferirTipoDeNombre('FECHA_ESCRITURA')).toEqual({ tipo: 'DATE', clase: 'fecha' });
    expect(inferirTipoDeNombre('DNI_COMPRADOR')).toEqual({ tipo: 'TEXT', clase: 'documento_identidad' });
    expect(inferirTipoDeNombre('PRECIO_TOTAL')).toEqual({ tipo: 'NUM', clase: 'euros' });
    expect(inferirTipoDeNombre('SUPERFICIE_UTIL')).toEqual({ tipo: 'NUM', clase: 'metros_cuadrados' });
  });

  it('ignora el arroba de las convenciones del motor', () => {
    expect(inferirTipoDeNombre('@FECHA_X')?.tipo).toBe('DATE');
  });

  it('devuelve null cuando el nombre no dice nada, en vez de inventar', () => {
    expect(inferirTipoDeNombre('CLAUSULA_TERCERA')).toBeNull();
    expect(inferirTipoDeNombre('X')).toBeNull();
  });

  it('no se dispara por una coincidencia en medio del nombre', () => {
    // `MODIFICA_FECHA` no es una fecha: el patrón ancla al principio.
    expect(inferirTipoDeNombre('MODIFICA_FECHA')).toBeNull();
  });
});
