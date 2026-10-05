// COUNT(ARRAY) dentro de un IF (5-oct-2026). Las cancelaciones escribían
// `LEN(FINCAS) > 1`, que no existe: salía siempre en singular.
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics, validateText } from '../index';
const c = (t: string, v: Record<string, unknown>) => (composeWithDiagnostics(t, v as never) as { text: string }).text;

describe('COUNT(ARRAY) en una condición', () => {
  const T = '{{IF COUNT(FINCAS) > 1}}FINCAS HIPOTECADAS{{ELSE}}FINCA HIPOTECADA{{ENDIF}}';
  it('plural con varias, singular con una o ninguna', () => {
    expect(c(T, { FINCAS: [{}, {}] })).toBe('FINCAS HIPOTECADAS');
    expect(c(T, { FINCAS: [{}] })).toBe('FINCA HIPOTECADA');
    expect(c(T, {})).toBe('FINCA HIPOTECADA');
  });
  it('todos los operadores', () => {
    const v = { L: [1, 2, 3] };
    for (const [op, k, r] of [['==', 3, 'S'], ['!=', 3, 'N'], ['>=', 3, 'S'], ['<=', 2, 'N'], ['<', 4, 'S'], ['>', 3, 'N']] as const)
      expect(c(`{{IF COUNT(L) ${op} ${k}}}S{{ELSE}}N{{ENDIF}}`, v)).toBe(r);
  });
  it('se combina con AND y paréntesis', () => {
    expect(c('{{IF (COUNT(L) > 1 AND X=="a")}}S{{ELSE}}N{{ENDIF}}', { L: [1, 2], X: 'a' })).toBe('S');
  });
  it('el validador lo acepta', () => {
    expect(validateText(T).diagnostics.filter((d) => d.code === 'E013')).toEqual([]);
  });
});
