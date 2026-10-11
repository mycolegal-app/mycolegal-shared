// E904 (certificación de los esquemas base, 10-oct-2026): ELSEIF no existe en el lenguaje.
import { test, expect } from 'vitest';
import { validateText } from '../src/syntax/validate';

const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);

test('ELSEIF, ELSE IF y ELSE_IF son error E904; la forma anidada no', () => {
  for (const kw of ['ELSEIF', 'ELSE IF', 'ELSE_IF']) {
    expect(codigos(`{{DECLARE T:INPUT(t)}}{{IF T=="a"}}A{{${kw} T=="b"}}B{{ENDIF}}`)).toContain('E904');
  }
  expect(codigos('{{DECLARE T:INPUT(t)}}{{IF T=="a"}}A{{ELSE}}{{IF T=="b"}}B{{ENDIF}}{{ENDIF}}')).not.toContain('E904');
});
