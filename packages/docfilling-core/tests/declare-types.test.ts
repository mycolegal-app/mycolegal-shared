// Sinónimos de tipo en el DECLARE (A8, decidido el 2-oct-2026).
//
// Primera evolución deliberada respecto al motor de referencia: el Python
// emite `E051` (error) con cualquier tipo que no sea uno de los cuatro
// canónicos, y la biblioteca real escribe `BOOLEAN`, `NUMBER`, `STRING` y `LIST`
// en 4 ficheros. Desde D25 este paquete ya no preserva la paridad, así que los
// acepta y los traduce.
import { describe, it, expect } from 'vitest';
import { esquemaDeCampos, validateText, tipoCanonico, tipoAceptado } from '../index';

const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);
const tipoDe = (t: string) => esquemaDeCampos(t).campos[0]?.tipo;

describe('sinónimos de tipo', () => {
  it('los cuatro canónicos siguen valiendo', () => {
    for (const t of ['BOOL', 'TEXT', 'NUM', 'DATE']) {
      expect(codigos(`{{DECLARE X AS ${t}}}`)).not.toContain('E051');
      expect(tipoDe(`{{DECLARE X AS ${t}}}`)).toBe(t);
    }
  });

  it('acepta los sinónimos que usa la biblioteca y los traduce', () => {
    const casos: Array<[string, string]> = [
      ['BOOLEAN', 'BOOL'],   // VAR_ISD_ALA.md, 7 declaraciones
      ['NUMBER', 'NUM'],     // VAR_TEST_CAT_429_9_ALBACEA_UNIVERSAL.md:7
      ['STRING', 'TEXT'],    // VAR_ISD_GAL.md:16
      ['LIST', 'TEXT'],      // VAR_ESTIPULACION_3_…_DONACION.md:1
    ];
    for (const [escrito, esperado] of casos) {
      expect(codigos(`{{DECLARE X AS ${escrito}}}`), escrito).not.toContain('E051');
      expect(tipoDe(`{{DECLARE X AS ${escrito}}}`), escrito).toBe(esperado);
    }
  });

  it('sigue avisando de un tipo que no significa nada', () => {
    expect(codigos('{{DECLARE X AS COLOR}}')).toContain('E051');
    // Y el esquema no miente: devuelve lo que había escrito.
    expect(tipoDe('{{DECLARE X AS COLOR}}')).toBe('COLOR');
  });

  it('la comprobación del valor fijo se hace sobre el tipo CANÓNICO', () => {
    // Antes, con un sinónimo, `E051` cortaba y el valor no se comprobaba nunca.
    expect(codigos('{{DECLARE X AS BOOL=quizás}}')).toContain('W051');
    expect(codigos('{{DECLARE X AS BOOLEAN=quizás}}')).toContain('W051');
    expect(codigos('{{DECLARE P AS NUM=cinco}}')).toContain('W052');
    expect(codigos('{{DECLARE P AS NUMBER=cinco}}')).toContain('W052');
  });

  it('un valor fijo correcto no se queja, con sinónimo o sin él', () => {
    expect(codigos('{{DECLARE X AS BOOLEAN=TRUE}}')).not.toContain('W051');
    expect(codigos('{{DECLARE P AS NUMBER=5}}')).not.toContain('W052');
  });

  it('el caso real de la biblioteca: PORCENTAJE_RETRIBUCION AS NUMBER…=5', () => {
    const t = '{{DECLARE PORCENTAJE_RETRIBUCION AS NUMBER:INPUT(Porcentaje de retribución)=5}}';
    expect(codigos(t)).not.toContain('E051');
    expect(codigos(t)).not.toContain('W052');
    expect(tipoDe(t)).toBe('NUM');
  });

  it('los ayudantes son la fuente única', () => {
    expect(tipoCanonico('boolean')).toBe('BOOL');
    expect(tipoCanonico('')).toBe('TEXT');
    expect(tipoCanonico('COLOR')).toBe('COLOR');
    expect(tipoAceptado('NUMERO')).toBe(true);
    expect(tipoAceptado('COLOR')).toBe(false);
  });
});

describe('W900 · :INPUT(...) y :OPTIONS(...) en el mismo DECLARE', () => {
  it('avisa, porque el motor pierde las opciones y el valor por defecto', () => {
    // 4 declaraciones en 2 ficheros de la biblioteca. El Python sólo dice «W053:
    // OPTIONS está vacío», que es el síntoma; esto nombra la causa.
    const t = '{{DECLARE X AS TEXT:INPUT(Tipo):OPTIONS(a, b, c)=a}}';
    const d = validateText(t).diagnostics;
    expect(d.map((x) => x.code)).toContain('W900');
    expect(d.find((x) => x.code === 'W900')?.message).toContain(':INPUT(pregunta|opción');
  });

  it('con una sola forma no avisa — y las opciones SÍ llegan', () => {
    const soloOptions = '{{DECLARE X AS TEXT:OPTIONS(a, b (c/d), e)=a}}';
    expect(validateText(soloOptions).diagnostics.map((x) => x.code)).not.toContain('W900');
    const c = esquemaDeCampos(soloOptions).campos[0];
    // De paso: un paréntesis dentro de una opción no estorba.
    expect(c.opciones).toEqual(['a', 'b (c/d)', 'e']);

    const soloInput = '{{DECLARE X:INPUT(Tipo|a,b,c)}}';
    expect(validateText(soloInput).diagnostics.map((x) => x.code)).not.toContain('W900');
  });

  it('el caso real de la biblioteca queda señalado', () => {
    const t = '{{DECLARE TIPO_NEGOCIO_DONACION AS LIST:INPUT(Tipo de negocio jurídico):OPTIONS(Donación pura y simple, Donación con causa onerosa (modal/carga), Donación remuneratoria)=Donación pura y simple}}';
    const codes = validateText(t).diagnostics.map((x) => x.code);
    expect(codes).toContain('W900');   // la causa
    expect(codes).toContain('W053');   // el síntoma que ya daba el Python
    expect(codes).not.toContain('E051'); // LIST ya se acepta
  });
});
