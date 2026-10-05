// LOS VALORES QUE APAGAN UN `{{IF}}` — y el que no lo apagaba.
//
// `isTruthy` no se exporta, así que se prueba por donde importa: componiendo.
// Es además la forma correcta de probarlo, porque lo que se quiere garantizar
// no es el valor de una función privada, es que la CLÁUSULA no salga.
import { test, expect } from 'vitest';
import { composeWithDiagnostics } from '../src/compose/engine';

const PLANTILLA = '{{IF ES_SUCESORIO}}CLAUSULA_SUCESION{{ENDIF}}fin';

function sale(valor: string): boolean {
  const { text } = composeWithDiagnostics(PLANTILLA, { ES_SUCESORIO: valor } as never);
  return text.includes('CLAUSULA_SUCESION');
}

test('apagan la condición: vacío, NO en cualquier caja, FALSE en cualquier caja', () => {
  for (const v of ['', 'NO', 'No', 'no', ' no ', 'NO DISPONIBLE', 'FALSE', 'False', 'false', ' false ']) {
    expect(sale(v), `«${v}» debería apagar la condición`).toBe(false);
  }
});

test('la encienden: Sí, un código, un número', () => {
  for (const v of ['Sí', 'SI', 'true', 'TRUE', '1', 'PERSONA_FISICA']) {
    expect(sale(v), `«${v}» debería encender la condición`).toBe(true);
  }
});

// ⚠️ EL CASO QUE ESTABA ROTO. Antes del 4-oct-2026 la comparación era
// `sv === "FALSE"` —mayúsculas exactas—, así que `"false"` encendía la
// condición. Lo descubrió la extracción con IA de F5 proponiendo
// `ES_ACTO_SUCESORIO = "false"` para una compraventa: aceptado, habría metido
// una cláusula de sucesión sin dejar hueco ni aviso.
test('«false» en minúscula NO enciende la condición', () => {
  expect(sale('false')).toBe(false);
});
