// F1.6 — generación del XML del Índice Único (y retirada de :IUI / MAP_IUI).
//
// Los casos salen de `test_filler_iui.py` del SaaS (276 líneas), que es el
// biblioteca que ya existía para esto, más los de `iui_generator.py`.
import { describe, it, expect } from 'vitest';
import { generarIui, valorUtil, IUI_NAMESPACE, parseFields, validateText } from '../index';

// `mapaIui` / `mapaIuiDetallado` se retiraron con `:IUI` y `MAP_IUI` (W913, plan
// REQ_CATALOGO_IUI): el IUI vive en el catálogo. Aquí queda el constructor del XML.
describe(':IUI y MAP_IUI retirados', () => {
  it('el DECLARE se sigue leyendo entero, y avisa W913', () => {
    const t = '{{DECLARE PRECIO AS NUM:[Precio]:IUI(DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP)=0}}';
    const [f] = parseFields(t);
    expect(f.name).toBe('PRECIO');
    expect(f.declareInstruction).toBe('Precio');
    expect(f.declareValue).toBe('0');
    expect(f.iuiObsoleto).toBe(true);
    expect(validateText(t).diagnostics.map((d) => d.code)).toContain('W913');
  });

  it('también en arrays (lista y subcampos) y en MAP_IUI', () => {
    const arr = '{{DECLARE ARRAY V(NOMBRE:IUI(PER/NOM), DNI AS TEXT):IUI(DOCS_NOT/DOC_NOT/SUJS/SUJ)}}';
    const [f] = parseFields(arr);
    expect(f.arraySubfields.map((x) => x.name)).toEqual(['NOMBRE', 'DNI']);
    expect(f.iuiObsoleto).toBe(true);
    expect(validateText('{{DECLARE ARRAY L(NOMBRE:IUI(PER/NOM))}}').diagnostics.map((d) => d.code)).toContain('W913');
    expect(validateText('{{MAP_IUI:FECHA:DOCS_NOT/DOC_NOT/FEC_DOC}}').diagnostics.map((d) => d.code)).toContain('W913');
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
