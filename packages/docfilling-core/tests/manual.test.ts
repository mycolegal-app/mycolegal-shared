// Los ejemplos del MANUAL, contra el motor.
//
// POR QUÉ ESTE TEST EXISTE
//
// Los manuales de sintaxis del Drive —`DOCFILLING_SYNTAX.md`, `CONDICIONALES.md`,
// `PARRAFOS.md`— se comparten con Doku y los usan agentes para generar plantillas.
// Una documentación que miente es peor que ninguna: quien la lea escribirá
// plantillas que no hacen lo que el manual promete.
//
// Aquí están los ejemplos que el manual afirma, verbatim. Si el motor cambia y
// el manual se queda viejo, esto falla y dice cuál.
import { describe, it, expect } from 'vitest';
import { compose, composeWithDiagnostics, validateText, parseNumero } from '../index';

describe('manual · la tabla de interpretación de números (§5)', () => {
  it.each([
    ['500000', 500000],
    ['500.000', 500000],
    ['500.000,00', 500000],
    ['500,000.00', 500000],
    ['500,50', 500.5],
    ['500.5', 500.5],
    ['500.000,00 €', 500000],
    ['-1.500,25', -1500.25],
  ])('%s se lee como %s', (escrito, esperado) => {
    expect(parseNumero(escrito)).toBeCloseTo(esperado, 9);
  });

  it.each(['1.2345,00', '12.34.567', '1,2,3.4.5'])('%s se rechaza, no se aproxima', (mal) => {
    expect(parseNumero(mal)).toBeNull();
  });
});

describe('manual · el umbral de apoderados (§5 y el registro de cambios)', () => {
  const T = '{{IF TOTAL_RESP_CANCELADA <= 500000}}un solo apoderado{{ELSE}}dos apoderados{{ENDIF}}';

  it('por debajo del límite firma uno', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '250000' })).toContain('un solo apoderado');
  });

  it('por encima firman dos, también con el importe en formato español', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '750.000,00' })).toContain('dos apoderados');
  });

  it('un valor no numérico avisa con W904', () => {
    const { warnings } = composeWithDiagnostics(T, { TOTAL_RESP_CANCELADA: 'pendiente' });
    expect(warnings.some((w) => w.code === 'W904')).toBe(true);
  });

  it('un campo vacío NO avisa: falta el dato, no es un error', () => {
    const { warnings } = composeWithDiagnostics(T, { TOTAL_RESP_CANCELADA: '' });
    expect(warnings.some((w) => w.code === 'W904')).toBe(false);
  });
});

describe('manual · cierres, directivas que sobreviven y diagnósticos', () => {
  it('{{END IF}} cierra el bloque (§5)', () => {
    expect(compose('{{IF X}}protegido{{END IF}}', { X: '' })).not.toContain('protegido');
  });

  it('…y avisa W903', () => {
    expect(validateText('{{IF X}}a{{END IF}}').diagnostics.some((d) => d.code === 'W903')).toBe(true);
  });

  it('{{PAGEBREAK}} sobrevive a la composición (§21.6)', () => {
    expect(compose('a\n{{PAGEBREAK}}\nb', {})).toContain('{{PAGEBREAK}}');
    // Y el manual promete que la grafía vieja sigue valiendo (D38).
    expect(compose('a\n{{SALTO_PAGINA}}\nb', {})).toContain('{{SALTO_PAGINA}}');
  });

  it('{{WORD_STYLE:...}} también (§21.6)', () => {
    expect(compose('{{WORD_STYLE:Fórmula notarial}}x', {}))
      .toContain('{{WORD_STYLE:Fórmula notarial}}');
  });

  it('un INCLUDE con ruta da E901 (§9)', () => {
    expect(validateText('{{INCLUDE FISCALIDAD_CCAA/09_CATALUNA/PARR_X}}').diagnostics
      .some((d) => d.code === 'E901')).toBe(true);
  });

  it('una palabra clave con dos puntos da E902 (§17)', () => {
    expect(validateText('{{IF: CAMPO}}').diagnostics.some((d) => d.code === 'E902')).toBe(true);
  });

  it.each([
    '{{COMMENT: nota}}', '{{DEPENDENCY: ley}}', '{{SYSTEM: FECHA}}',
    '{{AUTO:uno|dos}}', '{{HUMAN_ACTION: tarea}}', '{{TAGS: a,b}}', '{{SUMMARY: x}}',
  ])('…y las que SÍ llevan dos puntos no se quejan: %s', (t) => {
    expect(validateText(t).diagnostics.some((d) => d.code === 'E902')).toBe(false);
  });
});
