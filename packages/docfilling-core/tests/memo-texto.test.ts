// Lo que sólo depende del texto, calculado una vez (15-nov-2026): mismo resultado, y lo que se entrega es una copia.
import { describe, it, expect, beforeEach } from 'vitest';
import { constantesFijas, extractDeclareFixedValues } from '../src/compose/engine';
import { listasDeLaPlantilla, marcarListasParaSonda } from '../src/fields/listas';
import { valoresDeSchema } from '../src/syntax/schema-meta';
import { olvidarMemoPorTexto } from '../src/compose/memo-texto';

// Un esquema grande (pasa del mínimo para guardarse) con constantes, respaldos, listas y metadatos.
const RELLENO = 'Texto corrido de la escritura. '.repeat(1000);
const ESQUEMA = [
  '{{SCHEMA:ACT=0501 ALIAS COMPRAVENTA}}{{SCHEMA:GROUP=TRANSMISION, ONEROSA}}',
  '{{DECLARE TIPO_FINCA = "Urbana"}}{{DECLARE_UNDEF REGIMEN = "Gananciales"}}',
  '{{DECLARE ARRAY COMPRADORES(NOMBRE, ESTADO)}}',
  RELLENO,
  '{{FOR EACH C IN COMPRADORES}}{{C.NOMBRE}}{{IF C.ESTADO == "Casado"}} casado{{ENDIF}}{{ENDFOR}}',
  RELLENO,
].join('\n');

describe('memo por texto', () => {
  beforeEach(() => olvidarMemoPorTexto());

  it('la segunda llamada da lo mismo que la primera, y lo mismo que sin caché', () => {
    const fns = [constantesFijas, extractDeclareFixedValues, listasDeLaPlantilla, marcarListasParaSonda, valoresDeSchema] as const;
    for (const f of fns) {
      const primera = (f as (t: string) => unknown)(ESQUEMA);
      const segunda = (f as (t: string) => unknown)(ESQUEMA);
      expect(segunda).toEqual(primera);
      olvidarMemoPorTexto();
      expect((f as (t: string) => unknown)(ESQUEMA)).toEqual(primera);
    }
  });

  it('una copia igual del texto (otro objeto, mismo contenido) acierta', () => {
    const a = constantesFijas(ESQUEMA);
    const copia = (' ' + ESQUEMA).slice(1);
    expect(constantesFijas(copia)).toEqual(a);
  });

  it('modificar lo que se recibe no cambia lo guardado', () => {
    constantesFijas(ESQUEMA).add('INTRUSO');
    expect(constantesFijas(ESQUEMA).has('INTRUSO')).toBe(false);

    extractDeclareFixedValues(ESQUEMA).TIPO_FINCA = 'Rústica';
    expect(extractDeclareFixedValues(ESQUEMA).TIPO_FINCA).toBe('Urbana');

    const l = listasDeLaPlantilla(ESQUEMA);
    l.listas.get('COMPRADORES')!.subcampos.set('INTRUSO', 'TEXT');
    l.listas.get('COMPRADORES')!.condiciones.add('INTRUSO');
    l.listas.get('COMPRADORES')!.valores.get('ESTADO')?.add('INTRUSO');
    l.soloDeElemento.add('INTRUSO');
    const otra = listasDeLaPlantilla(ESQUEMA);
    expect(otra.listas.get('COMPRADORES')!.subcampos.has('INTRUSO')).toBe(false);
    expect(otra.listas.get('COMPRADORES')!.condiciones.has('INTRUSO')).toBe(false);
    expect(otra.listas.get('COMPRADORES')!.valores.get('ESTADO')?.has('INTRUSO') ?? false).toBe(false);
    expect(otra.soloDeElemento.has('INTRUSO')).toBe(false);

    valoresDeSchema(ESQUEMA)['SCHEMA:ACT'] = '9999';
    expect(valoresDeSchema(ESQUEMA)['SCHEMA:ACT']).toBe('0501');
  });

  it('valoresDeSchema con lengua pedida la pone encima sin tocar lo guardado', () => {
    expect(valoresDeSchema(ESQUEMA, 'CA')['SCHEMA:LANG']).toBe('ca');
    expect(valoresDeSchema(ESQUEMA)['SCHEMA:LANG']).toBe('es');
    expect(valoresDeSchema(ESQUEMA, '')['SCHEMA:LANG']).toBe('es');
  });

  it('textos distintos no se confunden', () => {
    const otro = ESQUEMA.replace('"Urbana"', '"Rústica"');
    expect(extractDeclareFixedValues(ESQUEMA).TIPO_FINCA).toBe('Urbana');
    expect(extractDeclareFixedValues(otro).TIPO_FINCA).toBe('Rústica');
    expect(extractDeclareFixedValues(ESQUEMA).TIPO_FINCA).toBe('Urbana');
  });
});
