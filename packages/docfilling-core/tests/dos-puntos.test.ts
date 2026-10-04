// `E902` — palabra del lenguaje con dos puntos donde va un espacio.
//
// El caso que lo motiva es de producción: los 5 párrafos de reducciones de
// donación de Cantabria escriben `{{IF: CANTABRIA_...}}`, están enrutados, y
// por eso reclamaban la reducción **siempre**, cumpliera o no los requisitos.
import { describe, it, expect } from 'vitest';
import { validateText, compose, parseFields, FieldType } from '../index';

const e902 = (t: string) => validateText(t).diagnostics.filter((d) => d.code === 'E902');

describe('E902 · dos puntos en palabra clave', () => {
  it('demuestra el daño: {{IF:}} no es condicional y la cláusula se emite igual', () => {
    const t = '{{IF: X}}\nCláusula protegida.\n{{ENDIF}}';
    // No es un condicional: es un campo de datos.
    expect(parseFields(t)[0].fieldType).toBe(FieldType.EXTRACTED);
    // Y con X en falso, el texto sale de todas formas, con un marcador encima.
    const salida = compose(t, { X: '' });
    expect(salida).toContain('Cláusula protegida.');
    expect(salida).toContain('[NO DISPONIBLE]');
  });

  it('lo detecta en IF y explica que el texto se emite siempre', () => {
    const d = e902('{{IF: CANTABRIA_ISD_DONACION_EMPRESA}}');
    expect(d).toHaveLength(1);
    expect(d[0].message).toContain('SIEMPRE');
    expect(d[0].fix?.replacement).toBe('{{IF CANTABRIA_ISD_DONACION_EMPRESA}}');
  });

  it('y en DECLARE, donde el campo nunca se declara', () => {
    const d = e902('{{DECLARE: NOMBRE_CONYUGE}}');
    expect(d).toHaveLength(1);
    expect(d[0].fix?.replacement).toBe('{{DECLARE NOMBRE_CONYUGE}}');
  });

  it('también DECLARE ARRAY, SET, ELSEIF y FOR EACH', () => {
    expect(e902('{{DECLARE ARRAY: L}}')[0].fix?.replacement).toBe('{{DECLARE ARRAY L}}');
    expect(e902('{{SET: X = 1}}')[0].fix?.replacement).toBe('{{SET X = 1}}');
    expect(e902('{{ELSEIF: Y}}')[0].fix?.replacement).toBe('{{ELSEIF Y}}');
    expect(e902('{{FOR EACH: I IN L}}')[0].fix?.replacement).toBe('{{FOR EACH I IN L}}');
  });

  it('NO se queja de las palabras que sí llevan dos puntos', () => {
    for (const t of [
      '{{COMMENT: nota}}', '{{DEPENDENCY: ley}}', '{{MAP_IUI:A:B}}',
      '{{TAGS: a,b}}', '{{SUMMARY: x}}', '{{SYSTEM: FECHA}}',
      '{{AUTO:uno|dos}}', '{{HUMAN_ACTION: pedir nota}}',
    ]) {
      expect(e902(t), t).toEqual([]);
    }
  });

  it('el INCLUDE con dos puntos se tolera y ya tiene su W081: no duplica aviso', () => {
    expect(e902('{{INCLUDE: PARR_X}}')).toEqual([]);
    expect(validateText('{{INCLUDE: PARR_X}}').diagnostics.some((d) => d.code === 'W081')).toBe(true);
  });

  it('las formas correctas no se quejan', () => {
    for (const t of ['{{IF X}}{{ENDIF}}', '{{DECLARE X AS TEXT}}', '{{SET X = 1}}']) {
      expect(e902(t), t).toEqual([]);
    }
  });
});
