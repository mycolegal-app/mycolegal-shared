// ELSEIF (certificación de los esquemas base, 10-oct-2026): el lenguaje lo declara, el motor no lo hacía.
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics } from '../index';

const md = 'X {{IF T=="a"}}**A**{{ELSEIF T=="b"}}**{{AUTO:está|están}} B**{{ELSE}}**C**{{ENDIF}} fin';
const sale = (T: string) => composeWithDiagnostics(md, { T } as never).text;

describe('ELSEIF', () => {
  it('sólo la rama que toca', () => {
    expect(sale('a')).toBe('X **A** fin');
    expect(sale('b')).toContain('B** fin');
    expect(sale('b')).not.toContain('**A**');
    expect(sale('z')).toBe('X **C** fin');
  });
  it('varios ELSEIF, sin ELSE y anidados', () => {
    const m = '{{IF N=="1"}}uno{{ELSEIF N=="2"}}dos{{ELSEIF N=="3"}}tres{{ENDIF}}|{{IF P}}p{{IF Q=="x"}}x{{ELSEIF Q=="y"}}y{{ENDIF}}{{ELSE}}nop{{ENDIF}}';
    const c = (v: Record<string, string>) => composeWithDiagnostics(m, v as never).text;
    expect(c({ N: '1', P: '', Q: '' })).toBe('uno|nop');
    expect(c({ N: '3', P: 'TRUE', Q: 'y' })).toBe('tres|py');
    expect(c({ N: '9', P: 'TRUE', Q: 'x' })).toBe('|px');
  });
});

describe('ELSE IF con espacio o guión bajo', () => {
  it('igual que ELSEIF', () => {
    const m = '{{IF T=="a"}}A{{ELSE IF T=="b"}}B{{ELSE_IF T=="c"}}C{{ELSE}}D{{ENDIF}}';
    const c = (T: string) => composeWithDiagnostics(m, { T } as never).text;
    expect([c('a'), c('b'), c('c'), c('z')]).toEqual(['A', 'B', 'C', 'D']);
  });
});
