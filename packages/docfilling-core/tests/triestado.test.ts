import { describe, it, expect } from 'vitest';
import { condicionTriestado } from '../index';

const sin = (v: Record<string, string>) => (c: string) => v[c] === undefined || v[c] === '';
const t = (cond: string, v: Record<string, string>) => condicionTriestado(cond, v, sin(v));

describe('condicionTriestado (lógica de tres valores sobre el evaluador del motor)', () => {
  it('sin datos: no se sabe, y faltan los campos', () => {
    expect(t('A AND B', {})).toEqual({ valor: null, faltan: ['A', 'B'] });
  });
  it('un falso decide un AND y un cierto decide un OR', () => {
    expect(t('A AND B', { A: 'FALSE' })).toEqual({ valor: false, faltan: [] });
    expect(t('A OR B', { A: 'TRUE' })).toEqual({ valor: true, faltan: [] });
  });
  it('sólo pide lo que aún cambia el resultado', () => {
    const cond = 'EXIGE OR (NOT NO_RES AND ((CA == "Andalucía" AND (R1 OR R2)) OR (CA == "Baleares" AND B1)))';
    expect(t(cond, { EXIGE: 'FALSE', NO_RES: 'FALSE', CA: 'Andalucía' })).toEqual({ valor: null, faltan: ['R1', 'R2'] });
    expect(t(cond, { EXIGE: 'FALSE', NO_RES: 'FALSE', CA: 'Andalucía', R1: 'FALSE', R2: 'FALSE' })).toEqual({ valor: false, faltan: [] });
    expect(t(cond, { EXIGE: 'FALSE', NO_RES: 'TRUE' })).toEqual({ valor: false, faltan: [] });
  });
  it('NOT invierte y deja lo que falta', () => {
    expect(t('NOT A', {})).toEqual({ valor: null, faltan: ['A'] });
    expect(t('NOT A', { A: 'Sí' })).toEqual({ valor: false, faltan: [] });
  });
  it('las comparaciones las evalúa el motor (==, IN, comparación numérica)', () => {
    expect(t('X == "Sí, con reservas"', { X: 'Sí, con reservas' }).valor).toBe(true);
    expect(t('X IN ("a", "b")', { X: 'b' }).valor).toBe(true);
    expect(t('P > 1000', { P: '2.000,00' }).valor).toBe(true);
    expect(t('X != "a"', {})).toEqual({ valor: null, faltan: ['X'] });
  });
});
