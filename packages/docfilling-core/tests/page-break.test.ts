// `{{PAGEBREAK}}` (D23, renombrada por D38): con `{{WORD_STYLE:…}}`, una de las
// dos directivas que sobreviven intactas a compose.
//
// Cada test fija una de las tres conductas que estaban mal antes de darle tipo
// propio, y las tres fallaban EN SILENCIO — ver `src/syntax/page-break.ts`.
// Los últimos fijan el renombrado: la grafía vieja sigue FUNCIONANDO y avisando,
// porque dejar de reconocerla devolvería el `[NO DISPONIBLE]` que la directiva
// existe para evitar.
import { describe, it, expect } from 'vitest';
import {
  compose, parseFields, validateText, applyFieldSuffix, stripDirectives,
  expandirIncludes, repositorioDeMapa, FieldType, esPageBreak, esPageBreakHeredado,
  PAGEBREAK, PAGEBREAK_HEREDADO, PAGEBREAK_DIRECTIVA, PAGEBREAK_PATTERN_G,
} from '../index';

describe('{{PAGEBREAK}}', () => {
  it('tiene su propio tipo, no es un campo extraído', () => {
    const f = parseFields(PAGEBREAK_DIRECTIVA);
    expect(f).toHaveLength(1);
    expect(f[0].fieldType).toBe(FieldType.PAGE_BREAK);
  });

  it('sobrevive a compose en vez de salir como [NO DISPONIBLE]', () => {
    const salida = compose('Hola {{X}}.\n\n{{PAGEBREAK}}\n\nAdiós.', { X: 'mundo' });
    expect(salida).toContain(PAGEBREAK_DIRECTIVA);
    expect(salida).not.toContain('NO DISPONIBLE');
  });

  it('no pide DECLARE: no dispara W056', () => {
    const d = validateText('{{DECLARE X AS TEXT}}\n{{X}}\n{{PAGEBREAK}}').diagnostics;
    expect(d.filter((x) => x.code === 'W056')).toHaveLength(0);
    expect(d).toHaveLength(0);
  });

  it('el sufijo de FIELDS no la renombra, y sí renombra los campos de al lado', () => {
    expect(applyFieldSuffix('{{PAGEBREAK}} y {{X}}', '_A'))
      .toBe('{{PAGEBREAK}} y {{X_A}}');
  });

  it('sigue intacta dentro de un INCLUDE con sufijo', async () => {
    const repo = repositorioDeMapa({ P: 'antes\n{{PAGEBREAK}}\ndespués' });
    const r = await expandirIncludes('{{INCLUDE P FIELDS:_A}}', repo);
    expect(r.texto).toContain(PAGEBREAK_DIRECTIVA);
    expect(r.faltantes).toEqual([]);
  });

  it('no la retira stripDirectives, a diferencia de COMMENT', () => {
    const t = 'A\n{{COMMENT: nota}}\n{{PAGEBREAK}}\nB';
    const s = stripDirectives(t);
    expect(s).toContain(PAGEBREAK_DIRECTIVA);
    expect(s).not.toContain('nota');
  });

  it('el predicado tolera espacios y minúsculas, y no se pasa de listo', () => {
    expect(esPageBreak(PAGEBREAK)).toBe(true);
    expect(esPageBreak('  pagebreak  ')).toBe(true);
    expect(esPageBreak('PAGEBREAK_A')).toBe(false);
    expect(esPageBreak('PAGE')).toBe(false);
    expect(esPageBreak('PAGEBREAK: 2')).toBe(false);
  });
});

describe('la grafía heredada {{SALTO_PAGINA}} (D38)', () => {
  it('se sigue reconociendo con su tipo propio: no vuelve el [NO DISPONIBLE]', () => {
    expect(parseFields('{{SALTO_PAGINA}}')[0].fieldType).toBe(FieldType.PAGE_BREAK);
    const salida = compose('A\n\n{{SALTO_PAGINA}}\n\nB', {});
    expect(salida).toContain('{{SALTO_PAGINA}}');
    expect(salida).not.toContain('NO DISPONIBLE');
  });

  it('avisa W905 con su fix, y no la toma por un campo sin DECLARE', () => {
    const d = validateText('{{SALTO_PAGINA}}').diagnostics;
    const w = d.find((x) => x.code === 'W905');
    expect(w, 'W905').toBeDefined();
    expect(w!.fix?.replacement).toBe('{{PAGEBREAK}}');
    expect(d.filter((x) => x.code === 'W056')).toHaveLength(0);
  });

  it('la canónica NO avisa', () => {
    expect(validateText(PAGEBREAK_DIRECTIVA).diagnostics).toHaveLength(0);
    expect(esPageBreakHeredado(PAGEBREAK)).toBe(false);
    expect(esPageBreakHeredado(PAGEBREAK_HEREDADO)).toBe(true);
  });

  // El patrón vive en el paquete, y no en la fusión, para que las dos partan el
  // párrafo por el MISMO criterio con el que el motor la reconoce.
  it('el patrón caza las dos grafías, con espacios y en cualquier caja', () => {
    const t = 'a{{PAGEBREAK}}b{{ salto_pagina }}c{{PageBreak}}d';
    expect(t.split(PAGEBREAK_PATTERN_G)).toEqual(['a', 'b', 'c', 'd']);
  });
});
