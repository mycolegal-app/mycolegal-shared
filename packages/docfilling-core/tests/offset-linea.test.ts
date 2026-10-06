// `offsetToLineCol` con índice de líneas (6-oct-2026): la versión que recontaba los `\n`
// desde el principio en cada llamada era cuadrática y bloqueaba Redactor 7 s por análisis.
// Aquí se fija que el índice da EXACTAMENTE lo mismo que el cálculo ingenuo.
import { describe, it, expect } from 'vitest';
import { offsetToLineCol } from '../src/syntax/parser';

function ingenuo(text: string, offset: number): [number, number] {
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g) || []).length + 1;
  return [line, offset - before.lastIndexOf('\n')];
}

describe('offsetToLineCol', () => {
  it('coincide con el cálculo ingenuo en todos los desplazamientos', () => {
    const textos = ['', 'a', '\n', 'abc\ndef\n\nxyz', '\n\nhola\nmundo\n', 'línea ñ\r\notra\n{{CAMPO}}\n'];
    for (const t of textos) {
      for (let o = 0; o <= t.length; o++) expect(offsetToLineCol(t, o)).toEqual(ingenuo(t, o));
    }
  });

  it('alterna textos distintos sin mezclar índices', () => {
    expect(offsetToLineCol('a\nb\nc', 4)).toEqual([3, 1]);
    expect(offsetToLineCol('xyz', 2)).toEqual([1, 3]);
    expect(offsetToLineCol('a\nb\nc', 2)).toEqual([2, 1]);
  });

  it('es lineal: 100.000 consultas sobre 1 MB en poco tiempo', () => {
    const t = ('x'.repeat(40) + '\n').repeat(25_000);
    const a = performance.now();
    for (let i = 0; i < 100_000; i++) offsetToLineCol(t, (i * 7919) % t.length);
    expect(performance.now() - a).toBeLessThan(2_000);
  });
});
