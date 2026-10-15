import { describe, expect, it } from 'vitest';
import {
  composeWithDiagnostics, expandirIncludes, repositorioDeMapa, extractDeclareFixedValues,
  marcarRamas, ramasRecorridas, sinMarcasDeCobertura, ramasAlcanzables,
} from '../index';

const ESQUEMA = [
  '{{DECLARE TIPO_ACTO = "EXTINCION"}}',
  '{{DECLARE COMPARECE:INPUT(¿Cómo comparece?|Por sí,Por representante)}}',
  '{{IF COMPARECE == "Por representante"}}Comparece representado.{{IF HAY_PODER}}Exhibe poder.{{ENDIF}}{{ELSE}}Comparece por sí.{{ENDIF}}',
  '{{INCLUDE PARR_FISCAL}}',
].join('\n');
const BIBLIOTECA = {
  PARR_FISCAL: '{{IF TIPO_ACTO == "DONACION"}}Impuesto de donaciones.{{ENDIF}}{{IF TIPO_ACTO == "EXTINCION"}}AJD.{{ENDIF}}',
};

async function marcado() {
  const exp = await expandirIncludes(ESQUEMA, repositorioDeMapa(BIBLIOTECA), { nombrarParrafos: true });
  return { exp, m: marcarRamas(exp.texto) };
}

describe('modo cobertura', () => {
  it('marca cada IF con sus dos ramas, el párrafo que lo contiene y la rama de la que cuelga', async () => {
    const { m } = await marcado();
    expect(m.ramas.map((r) => [r.condicion, r.parrafo, r.padre, r.conElse])).toEqual([
      ['COMPARECE == "Por representante"', null, null, true],
      ['HAY_PODER', null, { id: 0, lado: 'T' }, false],
      ['TIPO_ACTO == "DONACION"', 'PARR_FISCAL', null, false],
      ['TIPO_ACTO == "EXTINCION"', 'PARR_FISCAL', null, false],
    ]);
    expect(m.preguntas).toEqual([{ campo: 'COMPARECE', opciones: ['Por sí', 'Por representante'], parrafo: null, padre: null, ordinal: 0 }]);
    expect(m.ramas.map((r) => r.ordinal)).toEqual([0, 1, 0, 1]);
    expect(m.texto).not.toContain('\x00PARR:');
  });

  it('cuenta sólo las ramas que salen en la escritura, no las evaluadas dentro de una rama descartada', async () => {
    const { m } = await marcado();
    const { text } = composeWithDiagnostics(m.texto, { COMPARECE: 'Por sí', HAY_PODER: 'TRUE' });
    const r = ramasRecorridas(text);
    // HAY_PODER es verdadero, pero su IF está dentro de la rama «representante», que no sale: no cuenta.
    expect([...r].sort()).toEqual(['0:F', '2:F', '3:T']);
    expect(sinMarcasDeCobertura(text)).toContain('Comparece por sí.');
    expect(sinMarcasDeCobertura(text)).not.toMatch(/\x00COV/);
  });

  it('el texto compuesto, sin las marcas, es el mismo que sin el modo cobertura', async () => {
    const { m } = await marcado();
    const normal = await expandirIncludes(ESQUEMA, repositorioDeMapa(BIBLIOTECA));
    for (const v of [{ COMPARECE: 'Por representante', HAY_PODER: '' }, { COMPARECE: 'Por representante', HAY_PODER: 'TRUE' }, { COMPARECE: 'Por sí' }]) {
      expect(sinMarcasDeCobertura(composeWithDiagnostics(m.texto, v).text)).toBe(composeWithDiagnostics(normal.texto, v).text);
    }
  });

  it('las constantes del esquema descartan las ramas de otro acto', async () => {
    const { exp, m } = await marcado();
    const alc = ramasAlcanzables(m.ramas, extractDeclareFixedValues(exp.texto));
    expect(alc.has('2:T')).toBe(false); // la donación, en la extinción
    expect(alc.has('3:F')).toBe(false);
    expect(['0:T', '0:F', '1:T', '1:F', '2:F', '3:T'].every((k) => alc.has(k))).toBe(true);
  });

  it('las copias de un mismo párrafo tienen los mismos ordinales', async () => {
    const exp = await expandirIncludes('{{INCLUDE P FIELDS:_VEND}}\n{{INCLUDE P FIELDS:_COMPR}}', repositorioDeMapa({ P: '{{IF X}}a{{ENDIF}}{{IF Y}}b{{ENDIF}}' }), { nombrarParrafos: true });
    const m = marcarRamas(exp.texto);
    expect(m.ramas.map((r) => [r.parrafo, r.ordinal, r.condicion])).toEqual([['P', 0, 'X_VEND'], ['P', 1, 'Y_VEND'], ['P', 0, 'X_COMPR'], ['P', 1, 'Y_COMPR']]);
  });
});
