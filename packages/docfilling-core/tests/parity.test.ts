// Paridad con el motor de referencia.
//
// Los 139 casos de `tests/parity/` son LOS MISMOS ficheros que corre el Python
// de `docfilling-syntax` (82 de composición + 57 de validación). No son tests
// escritos para el TS: son el contrato entre las dos implementaciones mientras
// convivan. Si uno falla, el motor TS se ha desviado del de referencia, y lo que
// se arregla es el TS — nunca el caso.
//
// FORMATO DE LOS FICHEROS (es el del Python, no se toca):
//   · compose-cases.json   → sin `kind`: compose(template, fields) === expected
//                            kind "applyFieldSuffix": applyFieldSuffix(input, suffix)
//   · validator-cases.json → `diagnostics` es una lista de TUPLAS
//                            [línea, columna, código, severidad]

import { describe, it, expect } from 'vitest';
import composeCases from './parity/compose-cases.json';
import validatorCases from './parity/validator-cases.json';
import { compose, applyFieldSuffix, validateText } from '../index';

type CasoCompose =
  | { name: string; template: string; fields: Record<string, unknown>; expected: string; kind?: undefined }
  | { name: string; kind: 'applyFieldSuffix'; input: string; suffix: string; expected: string };

type Tupla = [number, number, string, string];
interface CasoValidador {
  name: string;
  template: string;
  diagnostics: Tupla[];
}

describe('paridad · composición', () => {
  for (const c of composeCases as CasoCompose[]) {
    it(c.name, () => {
      if (c.kind === 'applyFieldSuffix') {
        expect(applyFieldSuffix(c.input, c.suffix)).toBe(c.expected);
      } else {
        expect(compose(c.template, c.fields)).toBe(c.expected);
      }
    });
  }
});

describe('paridad · validación', () => {
  for (const c of validatorCases as CasoValidador[]) {
    it(c.name, () => {
      const r = validateText(c.template);
      // Se comparan línea, columna, código y severidad. El TEXTO del mensaje no
      // entra en el contrato: se traduce y se reescribe sin cambiar el motor.
      const obtenidos = r.diagnostics.map((d) => [d.line, d.col, d.code, d.severity]);
      expect(obtenidos).toEqual(c.diagnostics.map((t) => [t[0], t[1], t[2], t[3]]));
    });
  }
});
