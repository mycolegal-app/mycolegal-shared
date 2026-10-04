// Comparaciones numéricas en el `{{IF}}`: `<=`, `>=`, `<`, `>`.
//
// El caso que las motiva es de producción: los 7 esquemas de cancelaciones del
// Banco Sabadell escriben `{{IF TOTAL_RESP_CANCELADA <= 500000}}`, y al no
// soportarse la condición **no protegía nada** — el bloque se emitía siempre y
// un límite de responsabilidad de 500.000 € no se comprobaba.
import { describe, it, expect } from 'vitest';
import {
  compose, composeWithDiagnostics, validateText, parseNumero, parseComparacion,
} from '../index';

describe('parseNumero — importes como los escribe una notaría', () => {
  it('formato español: el punto son miles y la coma decimales', () => {
    expect(parseNumero('500.000,00')).toBe(500000);
    expect(parseNumero('1.234.567,89')).toBeCloseTo(1234567.89);
    expect(parseNumero('500,50')).toBeCloseTo(500.5);
  });

  it('sólo punto: miles si son grupos exactos de tres', () => {
    expect(parseNumero('500.000')).toBe(500000);
    expect(parseNumero('1.234.567')).toBe(1234567);
  });

  it('sólo punto que NO son grupos de tres: decimal', () => {
    expect(parseNumero('500.5')).toBeCloseTo(500.5);
    expect(parseNumero('1.25')).toBeCloseTo(1.25);
  });

  it('formato inglés, con los dos separadores al revés', () => {
    expect(parseNumero('500,000.00')).toBe(500000);
  });

  it('entero pelado, signo, euro y espacios duros', () => {
    expect(parseNumero('500000')).toBe(500000);
    expect(parseNumero('-1.500,25')).toBeCloseTo(-1500.25);
    expect(parseNumero('500.000,00 €')).toBe(500000);
    expect(parseNumero('1 500')).toBe(1500);
  });

  it('lo que no es un número da null, NO cero', () => {
    for (const x of ['', '   ', 'mucho', 'NO DISPONIBLE', 'abc123']) {
      expect(parseNumero(x), x).toBeNull();
    }
  });

  it('rechaza la agrupación de millares mal formada', () => {
    // Si esto colara como un número, la escritura compararía un importe que
    // nadie escribió.
    for (const x of ['1,2,3.4.5', '1.2345,00', '12.34.567', '1.000.00', '1,00,000']) {
      expect(parseNumero(x), x).toBeNull();
    }
  });
});

describe('parseComparacion', () => {
  it('reconoce los cuatro operadores', () => {
    expect(parseComparacion('X <= 100')).toEqual({ campo: 'X', operador: '<=', literal: '100' });
    expect(parseComparacion('X>=100')!.operador).toBe('>=');
    expect(parseComparacion('X < 100')!.operador).toBe('<');
    expect(parseComparacion('X > 100')!.operador).toBe('>');
  });

  it('no confunde `<=` con `<`', () => {
    expect(parseComparacion('X <= 100')!.literal).toBe('100');
  });

  it('admite el subcampo del FOR EACH y el espacio SYSTEM:', () => {
    expect(parseComparacion('ITEM.IMPORTE > 0')!.campo).toBe('ITEM.IMPORTE');
    expect(parseComparacion('SYSTEM:AÑO >= 2026')!.campo).toBe('SYSTEM:AÑO');
  });

  it('no se traga lo que no es una comparación', () => {
    for (const x of ['X == 1', 'X != 1', 'X', 'X IN (a, b)', '<= 100', 'X <=']) {
      expect(parseComparacion(x), x).toBeNull();
    }
  });
});

describe('el {{IF}} con comparación', () => {
  const T = '{{IF TOTAL_RESP_CANCELADA <= 500000}}Bajo el límite.{{ELSE}}Por encima.{{ENDIF}}';

  it('el validador ya NO lo rechaza con E013', () => {
    const d = validateText('{{IF TOTAL_RESP_CANCELADA <= 500000}}x{{ENDIF}}').diagnostics;
    expect(d.filter((x) => x.code === 'E013')).toEqual([]);
  });

  it('protege de verdad: por encima del límite no emite', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '750000' })).toContain('Por encima.');
    expect(compose(T, { TOTAL_RESP_CANCELADA: '750000' })).not.toContain('Bajo el límite.');
  });

  it('y por debajo sí', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '250000' })).toContain('Bajo el límite.');
  });

  it('el límite exacto entra con <=', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '500000' })).toContain('Bajo el límite.');
  });

  it('compara bien el importe escrito en formato español', () => {
    // 500.000,00 NO es quinientos: es el límite exacto.
    expect(compose(T, { TOTAL_RESP_CANCELADA: '500.000,00' })).toContain('Bajo el límite.');
    expect(compose(T, { TOTAL_RESP_CANCELADA: '750.000,00' })).toContain('Por encima.');
  });

  it('un campo vacío no cumple, y no es un error: falta el dato', () => {
    const { text, warnings } = composeWithDiagnostics(T, { TOTAL_RESP_CANCELADA: '' });
    expect(text).toContain('Por encima.');
    expect(warnings.filter((w) => w.code === 'W904')).toEqual([]);
  });

  it('un valor que NO es número AVISA, en vez de valer falso en silencio', () => {
    const { text, warnings } = composeWithDiagnostics(T, { TOTAL_RESP_CANCELADA: 'pendiente' });
    expect(text).toContain('Por encima.');
    const w = warnings.filter((x) => x.code === 'W904');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('pendiente');
  });

  it('se combina con AND / OR / NOT como cualquier otro átomo', () => {
    const t = '{{IF A > 10 AND B <= 5}}sí{{ENDIF}}';
    expect(compose(t, { A: '20', B: '3' })).toContain('sí');
    expect(compose(t, { A: '20', B: '9' })).not.toContain('sí');
  });
});
