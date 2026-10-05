// Condiciones con paréntesis. Hasta el 5-oct-2026 cualquier grupo `(…)` daba
// FALSO: el evaluador dividía por OR/AND respetando los paréntesis, pero nunca
// los quitaba, y `evalAtom` buscaba un campo llamado `(A`. En la biblioteca hay
// 483 condiciones así (p. ej. el régimen de gananciales de la comparecencia).
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics } from '../index';

const si = (cond: string, campos: Record<string, string>) =>
  (composeWithDiagnostics(`{{IF ${cond}}}SI{{ELSE}}NO{{ENDIF}}`, campos as never) as { text: string }).text;

describe('condiciones con paréntesis', () => {
  it.each([
    ['(A=="x")', { A: 'x' }, 'SI'],
    ['(A=="x")', { A: 'n' }, 'NO'],
    ['A=="x" AND (B=="y" OR B=="z")', { A: 'x', B: 'y' }, 'SI'],
    ['A=="x" AND (B=="y" OR B=="z")', { A: 'x', B: 'q' }, 'NO'],
    ['A=="x" AND (B=="y" OR B=="z")', { A: 'n', B: 'y' }, 'NO'],
    ['(A=="x" OR A=="w") AND B=="y"', { A: 'w', B: 'y' }, 'SI'],
    ['(A=="x" AND (B=="y" OR (C=="1" AND D=="2")))', { A: 'x', B: 'q', C: '1', D: '2' }, 'SI'],
    ['(A=="x") AND (B=="y")', { A: 'x', B: 'y' }, 'SI'],
    ['(A=="x") AND (B=="y")', { A: 'x', B: 'n' }, 'NO'],
  ])('%s con %j → %s', (cond, campos, esperado) => {
    expect(si(cond, campos)).toBe(esperado);
  });

  it('NOT con y sin espacio delante del paréntesis', () => {
    expect(si('NOT (A=="x")', { A: 'x' })).toBe('NO');
    expect(si('NOT (A=="x")', { A: 'n' })).toBe('SI');
    expect(si('NOT(A=="x")', { A: 'x' })).toBe('NO');
  });

  it('un paréntesis dentro de un valor entre comillas no cuenta', () => {
    const c = 'TIPO=="Construcciones no están en zona ANEI (General)"';
    expect(si(`(${c})`, { TIPO: 'Construcciones no están en zona ANEI (General)' })).toBe('SI');
    expect(si(c, { TIPO: 'Construcciones no están en zona ANEI (General)' })).toBe('SI');
  });

  it('IN sigue funcionando dentro de un grupo', () => {
    expect(si('(ROL IN ("Vendedora", "Permutante") AND X=="1")', { ROL: 'Permutante', X: '1' })).toBe('SI');
  });
});

import { validateText } from '../index';
describe('el validador acepta los grupos con paréntesis', () => {
  it.each([
    '{{IF (A=="x")}}s{{ENDIF}}',
    '{{IF A=="x" AND (B=="y" OR B=="z")}}s{{ENDIF}}',
    '{{IF (COMP_PF_ESTADO_CIVIL=="casado/a" AND (COMP_PF_REGIMEN_MATRIMONIAL=="gananciales" OR COMP_PF_REGIMEN_MATRIMONIAL=="comunidad"))}}1{{ENDIF}}',
    '{{IF NOT(A=="x")}}s{{ENDIF}}',
  ])('%s', (t) => {
    expect(validateText(t).diagnostics.filter((d) => d.code === 'E013')).toEqual([]);
  });
  it('sigue rechazando lo que no es una expresión', () => {
    expect(validateText('{{IF (A=="x"}}s{{ENDIF}}').diagnostics.some((d) => d.code === 'E013')).toBe(true);
  });
});
