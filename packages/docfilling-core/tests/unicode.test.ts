// Identificadores con acento y Ñ.
//
// Python usa `\w` en modo Unicode, así que `{{INCLUDE PARR_LEY_CATALUÑA}}`
// captura el nombre entero. En JavaScript `\w` es ASCII, así que captura
// `PARR_LEY_CATALU` y se para en la Ñ. El TS generado heredó 62 `\w` sin flag
// `u`, y los 139 casos de paridad son todos ASCII, así que no lo veían.
//
// La biblioteca real SÍ los usa: AÑOS_ANTIGUEDAD, CONOCIMIENTO_IDIOMA_ESPAÑOL,
// TIPO_PH_CATALUÑA, PARR_LEY_ANDALUCÍA, PARR_LEY_ARAGÓN, PARR_LEY_CASTILLA_LEÓN.
import { describe, it, expect } from 'vitest';
import { parseFields, compose, includesDe, FieldType } from '../index';

describe('identificadores con acento y Ñ (biblioteca real)', () => {
  it('un INCLUDE con Ñ captura el nombre completo', () => {
    expect(includesDe('{{INCLUDE PARR_LEY_CATALUÑA}}')).toEqual(['PARR_LEY_CATALUÑA']);
  });

  it('un INCLUDE con tilde captura el nombre completo', () => {
    expect(includesDe('{{INCLUDE PARR_LEY_ARAGÓN}}')).toEqual(['PARR_LEY_ARAGÓN']);
  });

  it('un DECLARE con Ñ se reconoce con su nombre completo', () => {
    const campos = parseFields('{{DECLARE AÑOS_ANTIGUEDAD:[cuántos años tiene]}}');
    const d = campos.find((f) => f.fieldType === FieldType.DECLARE);
    expect(d?.name).toBe('AÑOS_ANTIGUEDAD');
  });

  it('un campo con Ñ se sustituye al componer', () => {
    expect(compose('Tiene {{AÑOS_ANTIGUEDAD}} años.', { AÑOS_ANTIGUEDAD: '30' }))
      .toBe('Tiene 30 años.');
  });

  it('un campo con tilde se sustituye al componer', () => {
    expect(compose('Habla {{IDIOMA_ESPAÑOL}}.', { IDIOMA_ESPAÑOL: 'castellano' }))
      .toBe('Habla castellano.');
  });
});
