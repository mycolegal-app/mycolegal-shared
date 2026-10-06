// Un cierre de INCLUDE sin apertura no puede llegar a la salida: sus `\x00` rompen el .docx.
import { describe, it, expect } from 'vitest';
import { processExitIncludes, INC_BEGIN_MARK, INC_END_MARK } from '../src/compose/engine';

describe('processExitIncludes · marcas huérfanas', () => {
  it('quita un INC_END sin INC_BEGIN', () => {
    expect(processExitIncludes(`a${INC_END_MARK}b`)).toBe('ab');
  });
  it('quita un INC_BEGIN sin INC_END', () => {
    expect(processExitIncludes(`a${INC_BEGIN_MARK}b`)).toBe('ab');
  });
  it('con pares y un cierre de más, no deja ningún \\x00', () => {
    const r = processExitIncludes(`${INC_BEGIN_MARK}uno${INC_END_MARK}dos${INC_END_MARK}tres`);
    expect(r).not.toContain('\x00');
    expect(r).toContain('uno');
    expect(r).toContain('tres');
  });
});
