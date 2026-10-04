// Tercer segmento del `@autonumber`: el modificador de caja.
//
// Lo destapó la rodaja de la fusión: `{{@autonumber:OTORG:ordinal:uppercase}}`
// no casaba con el regex de dos segmentos y **la directiva se quedaba literal
// dentro del .docx final**. Son 4 casos en 3 ficheros de `_PROD`, y no daban
// ningún aviso — el campo no existe, así que nadie lo echaba de menos.
import { describe, it, expect } from 'vitest';
import { processAutonumbers, compose } from '../index';

describe('@autonumber con modificador de caja', () => {
  it('resuelve la forma de tres segmentos en vez de dejarla literal', () => {
    expect(processAutonumbers('{{@autonumber:estipulacion:ordinal:uppercase}}')).toBe('PRIMERA');
    expect(compose('{{@autonumber:OTORG:ordinal:uppercase}}', {})).toBe('PRIMERA');
  });

  it('lowercase baja la caja del ordinal', () => {
    expect(processAutonumbers('{{@autonumber:x:ordinal:lowercase}}')).toBe('primera');
  });

  it('también sobre romanos', () => {
    expect(processAutonumbers('{{@autonumber:x:roman:lowercase}}')).toBe('i');
  });

  // La forma con el segmento del medio VACÍO (`{{@autonumber:x::uppercase}}`)
  // no se admite, y no se añade a propósito: no aparece ni una vez en el
  // biblioteca —las tres formas reales son `contador`, `contador:formato` y
  // `contador:formato:caja`— y admitirla complicaría el regex para nada. Si
  // alguien la escribe, la verá literal en el documento; cuando el
  // diagnóstico de autonumber exista (F1.8b), ahí es donde debe avisar.

  it('un modificador que no existe no rompe: devuelve el valor sin tocar', () => {
    expect(processAutonumbers('{{@autonumber:x:ordinal:loquesea}}')).toBe('PRIMERA');
  });

  it('las formas de uno y dos segmentos siguen igual', () => {
    expect(processAutonumbers('{{@autonumber:x}}')).toBe('1');
    expect(processAutonumbers('{{@autonumber:x:ordinal}}')).toBe('PRIMERA');
    expect(processAutonumbers('{{@autonumber:x:roman}}')).toBe('I');
    // Segundo segmento desconocido = contador jerárquico, y es a propósito.
    expect(processAutonumbers('{{@autonumber:x:sub}}')).toBe('0.1');
  });

  it('el contador sigue avanzando con el modificador puesto', () => {
    expect(processAutonumbers('{{@autonumber:e:ordinal:uppercase}} {{@autonumber:e:ordinal:uppercase}}'))
      .toBe('PRIMERA SEGUNDA');
  });
});
