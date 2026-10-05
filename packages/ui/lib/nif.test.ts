import { describe, it, expect } from 'vitest';
import { esNifValido } from './nif';

describe('#873 — NIF/NIE: forma y control', () => {
  it('DNI', () => {
    expect(esNifValido('12345678Z')).toBe(true);
    expect(esNifValido('12345678A')).toBe(false);
    expect(esNifValido('12.345.678-z')).toBe(true); // se normaliza
  });
  it('NIE', () => {
    expect(esNifValido('X1234567L')).toBe(true);
    expect(esNifValido('Y1234567X')).toBe(true);
    expect(esNifValido('Z1234567R')).toBe(true);
    expect(esNifValido('X1234567A')).toBe(false);
  });
  it('NIF de persona jurídica (CIF)', () => {
    expect(esNifValido('A08000143')).toBe(true); // Banco de Sabadell
    expect(esNifValido('A28015865')).toBe(true); // Telefónica
    expect(esNifValido('A58818501')).toBe(true); // control en cifra
    expect(esNifValido('B12345674')).toBe(true);
    expect(esNifValido('Q2826000H')).toBe(true); // control en letra
    expect(esNifValido('A58818502')).toBe(false);
  });
  it('basura', () => {
    expect(esNifValido('PASAPORTE123')).toBe(false);
    expect(esNifValido('')).toBe(false);
  });
});
