// F1.6 — mapeos IUI y generación del XML del Índice Único.
//
// Los casos salen de `test_filler_iui.py` del SaaS (276 líneas), que es el
// biblioteca que ya existía para esto, más los de `iui_generator.py`.
import { describe, it, expect } from 'vitest';
import { mapaIui, mapaIuiDetallado, generarIui, valorUtil, IUI_NAMESPACE } from '../index';

const PLANTILLA = [
  '{{MAP_IUI:FECHA:DOCS_NOT/DOC_NOT/FEC_DOC}}',
  '{{DECLARE PRECIO:[Precio]:IUI(DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP)}}',
  '{{DECLARE ARRAY VENDEDORES(NOMBRE:IUI(PER/NOM), DNI AS TEXT):IUI(DOCS_NOT/DOC_NOT/SUJS/SUJ)}}',
].join('\n');

describe('mapaIui', () => {
  it('reúne las dos formas del lenguaje', () => {
    expect(mapaIui(PLANTILLA)).toEqual({
      FECHA: 'DOCS_NOT/DOC_NOT/FEC_DOC',
      PRECIO: 'DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP',
      VENDEDORES: {
        path: 'DOCS_NOT/DOC_NOT/SUJS/SUJ',
        subcampos: { NOMBRE: 'PER/NOM', DNI: 'DNI' },
      },
    });
  });

  it('un subcampo sin :IUI cuelga por su propio nombre', () => {
    const m = mapaIui('{{DECLARE ARRAY L(A, B AS TEXT):IUI(X/Y)}}');
    expect(m.L).toEqual({ path: 'X/Y', subcampos: { A: 'A', B: 'B' } });
  });

  it('un array SIN ruta propia no mapea, aunque sus subcampos la tengan', () => {
    expect(mapaIui('{{DECLARE ARRAY L(NOMBRE:IUI(PER/NOM)):[l]}}')).toEqual({});
  });

  it('en conflicto gana el DECLARE, y se avisa', () => {
    const { mapeos, conflictos } = mapaIuiDetallado([
      '{{MAP_IUI:PRECIO:DOCS_NOT/DOC_NOT/OPES/OPE[2]/IMP}}',
      '{{DECLARE PRECIO:[Precio]:IUI(DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP)}}',
    ].join('\n'));
    expect(mapeos.PRECIO).toBe('DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP');
    expect(conflictos).toHaveLength(1);
    expect(conflictos[0].campo).toBe('PRECIO');
  });

  it('la misma ruta por las dos vías NO es conflicto, ni con barra de más', () => {
    const { conflictos } = mapaIuiDetallado([
      '{{MAP_IUI:PRECIO:/DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP}}',
      '{{DECLARE PRECIO:[Precio]:IUI(DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP)}}',
    ].join('\n'));
    expect(conflictos).toEqual([]);
  });
});

describe('valorUtil', () => {
  it('acepta texto, la forma {value} y descarta lo que no es dato', () => {
    expect(valorUtil('Juan')).toBe('Juan');
    expect(valorUtil({ value: 'Juan', source: 'x' })).toBe('Juan');
    expect(valorUtil(42)).toBe('42');
    expect(valorUtil('  ')).toBeNull();
    expect(valorUtil(null)).toBeNull();
    expect(valorUtil('NO DISPONIBLE')).toBeNull();
    // Es lo que el motor deja donde falta un valor: no puede llegar al XML.
    expect(valorUtil('[NO DISPONIBLE]')).toBeNull();
  });
});

describe('generarIui', () => {
  it('sin mapeos no genera nada', () => {
    expect(generarIui({}, { A: 'x' })).toBeNull();
  });

  it('sin ningún valor útil devuelve null, no un XML con sólo GEN_DAT', () => {
    expect(generarIui({ A: 'DOCS_NOT/DOC_NOT/X' }, {})).toBeNull();
    expect(generarIui({ A: 'DOCS_NOT/DOC_NOT/X' }, { A: '[NO DISPONIBLE]' })).toBeNull();
  });

  it('construye el árbol, con el namespace y los metadatos', () => {
    const xml = generarIui({ FECHA: 'DOCS_NOT/DOC_NOT/FEC_DOC' }, { FECHA: '2026-10-03' })!;
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(`<DOCS_NOT xmlns="${IUI_NAMESPACE}">`);
    expect(xml).toContain('<NOM_PRO>DocFilling</NOM_PRO>');
    expect(xml).toContain('<FEC_DOC>2026-10-03</FEC_DOC>');
  });

  it('la raíz DOCS_NOT de la ruta no se duplica', () => {
    const xml = generarIui({ A: 'DOCS_NOT/DOC_NOT/TIP_DOC' }, { A: 'CV' })!;
    expect(xml.match(/<DOCS_NOT/g)).toHaveLength(1);
  });

  it('crea los elementos intermedios que faltan, y el índice es 1-based', () => {
    const xml = generarIui({ A: 'DOCS_NOT/DOC_NOT/SUJS/SUJ[2]/NOM' }, { A: 'Ana' })!;
    // SUJ[1] se crea vacío para poder llegar a SUJ[2].
    expect(xml.match(/<SUJ\/>/g)).toHaveLength(1);
    expect(xml).toContain('<NOM>Ana</NOM>');
  });

  it('dos campos en el mismo padre comparten el elemento', () => {
    const xml = generarIui(
      { N: 'DOCS_NOT/DOC_NOT/SUJS/SUJ[1]/NOM', D: 'DOCS_NOT/DOC_NOT/SUJS/SUJ[1]/DNI' },
      { N: 'Ana', D: '123' },
    )!;
    expect(xml.match(/<SUJS>/g)).toHaveLength(1);
    expect(xml.match(/<SUJ>/g)).toHaveLength(1);
  });

  it('expande un array a elementos numerados', () => {
    const xml = generarIui(
      { V: { path: 'DOCS_NOT/DOC_NOT/SUJS/SUJ', subcampos: { NOMBRE: 'PER/NOM', DNI: 'DNI' } } },
      { V: [{ NOMBRE: 'Ana', DNI: '1' }, { NOMBRE: 'Luis', DNI: '2' }] },
    )!;
    expect(xml).toContain('<NOM>Ana</NOM>');
    expect(xml).toContain('<NOM>Luis</NOM>');
    expect(xml.match(/<SUJ>/g)).toHaveLength(2);
  });

  it('una clave sin subcampo declarado cuelga por su nombre, y los vacíos se saltan', () => {
    const xml = generarIui(
      { V: { path: 'DOCS_NOT/DOC_NOT/SUJS/SUJ' } },
      { V: [{ NOM: 'Ana', DNI: '' }] },
    )!;
    expect(xml).toContain('<NOM>Ana</NOM>');
    expect(xml).not.toContain('<DNI>');
  });

  it('acepta el array como JSON en una cadena, que es como llega de la IA', () => {
    const xml = generarIui(
      { V: { path: 'DOCS_NOT/DOC_NOT/SUJS/SUJ' } },
      { V: '[{"NOM":"Ana"}]' },
    )!;
    expect(xml).toContain('<NOM>Ana</NOM>');
  });

  it('un array de escalares escribe en el propio elemento', () => {
    const xml = generarIui({ V: { path: 'DOCS_NOT/DOC_NOT/REFS/REF' } }, { V: ['a', 'b'] })!;
    expect(xml).toContain('<REF>a</REF>');
    expect(xml).toContain('<REF>b</REF>');
  });

  it('escapa lo que rompería el XML', () => {
    const xml = generarIui({ A: 'DOCS_NOT/DOC_NOT/X' }, { A: 'Pérez & <Hijos>' })!;
    expect(xml).toContain('Pérez &amp; &lt;Hijos&gt;');
    expect(xml).not.toContain('& <');
  });
});
