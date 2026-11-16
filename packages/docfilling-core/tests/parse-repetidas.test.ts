// Cada directiva distinta se analiza una vez (15-nov-2026): las repetidas salen iguales, con su posición, y cada campo
// devuelto es un objeto propio.
import { describe, it, expect } from 'vitest';
import { parseFields } from '../src/syntax/parser';

const D = '{{DECLARE ESTADO:INPUT(¿Estado civil?|soltero,casado)}}';
const TEXTO = `Uno ${D}\nDos ${D} y {{NOMBRE}}\n\n  ${D}`;

describe('parseFields con directivas repetidas', () => {
  it('cada repetición sale como la primera, con su propia posición', () => {
    const r = parseFields(TEXTO).filter((f) => f.raw === D);
    expect(r).toHaveLength(3);
    expect(r.map((f) => [f.offset, f.line, f.col])).toEqual([
      [TEXTO.indexOf(D), 1, 5],
      [TEXTO.indexOf(D, TEXTO.indexOf(D) + 1), 2, 5],
      [TEXTO.lastIndexOf(D), 4, 3],
    ]);
    const sinPosicion = r.map(({ offset: _o, line: _l, col: _c, ...resto }) => resto);
    expect(sinPosicion[1]).toEqual(sinPosicion[0]);
    expect(sinPosicion[2]).toEqual(sinPosicion[0]);
    // y como si la directiva estuviera sola
    const { offset: _o, line: _l, col: _c, ...sola } = parseFields(D)[0];
    expect(sinPosicion[0]).toEqual(sola);
  });

  it('modificar un campo no toca sus repeticiones ni la llamada siguiente', () => {
    const r = parseFields(TEXTO).filter((f) => f.raw === D);
    r[0].inputOptions.push('INTRUSO');
    r[0].req.push({} as never);
    r[0].name = 'OTRO';
    expect(r[1].inputOptions).toEqual(['soltero', 'casado']);
    expect(r[1].req).toEqual([]);
    expect(r[1].name).toBe('ESTADO');
    expect(parseFields(TEXTO).find((f) => f.raw === D)!.inputOptions).toEqual(['soltero', 'casado']);
  });
});
