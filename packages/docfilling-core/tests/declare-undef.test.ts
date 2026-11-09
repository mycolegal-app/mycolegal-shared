// `DECLARE_UNDEF X=v`: declara X sólo si nadie le ha dado valor antes (9-nov-2026, 0405 ACT-253). La cabecera del
// esquema fija el valor que manda y los párrafos ponen el respaldo, sin que un DECLARE fijo de un párrafo la pise.
import { describe, it, expect } from 'vitest';
import {
  compose,
  composeForPreview,
  extractDeclareFixedValues,
  resolverDeclarados,
  applyFieldSuffix,
  parseFields,
  validateText,
  esquemaDeCampos,
} from '../index';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';

const GASTOS =
  '{{DECLARE_UNDEF ES_ACTO_SIN_TRANSMISION AS BOOL=FALSE}}' +
  'Gastos: {{IF ES_ACTO_SIN_TRANSMISION}}a cargo del otorgante{{ELSE}}del vendedor y del comprador{{ENDIF}}.';

describe('DECLARE_UNDEF · el caso real del 0405', () => {
  const repo = repositorioDeMapa({ PARR_GASTOS: GASTOS, PARR_URBANISMO: '{{DECLARE_UNDEF ES_ACTO_SIN_TRANSMISION AS BOOL=FALSE}}Urbanismo.' });

  it('cabecera TRUE y párrafo con respaldo FALSE ⇒ TRUE', async () => {
    const esquema =
      '{{DECLARE ES_ACTO_SIN_TRANSMISION AS BOOL=TRUE}}\n{{INCLUDE PARR_URBANISMO}}\n{{INCLUDE PARR_GASTOS}}';
    const { texto } = await expandirIncludes(esquema, repo, { centinelas: false });
    expect(compose(texto, {})).toContain('Gastos: a cargo del otorgante.');
    expect(resolverDeclarados(texto, {})).toEqual({ ES_ACTO_SIN_TRANSMISION: 'TRUE' });
    expect(extractDeclareFixedValues(texto)).toEqual({ ES_ACTO_SIN_TRANSMISION: 'TRUE' });
  });

  it('esquema sin cabecera ⇒ vale el respaldo, FALSE', async () => {
    const { texto } = await expandirIncludes('{{INCLUDE PARR_URBANISMO}}\n{{INCLUDE PARR_GASTOS}}', repo, { centinelas: false });
    expect(compose(texto, {})).toContain('Gastos: del vendedor y del comprador.');
    expect(extractDeclareFixedValues(texto)).toEqual({ ES_ACTO_SIN_TRANSMISION: 'FALSE' });
  });

  it('con centinelas de INCLUDE (como compone Redactor) da lo mismo', async () => {
    const esquema = '{{DECLARE ES_ACTO_SIN_TRANSMISION AS BOOL=TRUE}}\n{{INCLUDE PARR_GASTOS}}';
    const { texto } = await expandirIncludes(esquema, repo);
    expect(compose(texto, {})).toContain('Gastos: a cargo del otorgante.');
  });

  it('el DECLARE fijo de antes, repetido, sigue dando la trampa: gana el último', () => {
    const t = '{{DECLARE X AS BOOL=TRUE}}{{DECLARE X AS BOOL=FALSE}}{{IF X}}sí{{ELSE}}no{{ENDIF}}';
    expect(compose(t, {})).toBe('no');
  });
});

describe('DECLARE_UNDEF · reglas', () => {
  const pinta = '{{IF X}}sí{{ELSE}}no{{ENDIF}}';

  it('1. «antes» es el orden del texto: un DECLARE previo gana; sin nada antes, vale el respaldo', () => {
    expect(compose('{{DECLARE X AS BOOL=TRUE}}{{DECLARE_UNDEF X AS BOOL=FALSE}}' + pinta, {})).toBe('sí');
    expect(compose('{{DECLARE_UNDEF X AS BOOL=FALSE}}' + pinta, {})).toBe('no');
    // Dos respaldos: el primero declara y el segundo ya no hace nada.
    expect(compose('{{DECLARE_UNDEF X AS BOOL=TRUE}}{{DECLARE_UNDEF X AS BOOL=FALSE}}' + pinta, {})).toBe('sí');
  });

  it('2. un DECLARE en una rama que no se toma no cuenta: el respaldo se aplica', () => {
    const t = '{{IF A}}{{DECLARE X AS BOOL=TRUE}}{{ENDIF}}{{DECLARE_UNDEF X AS BOOL=FALSE}}' + pinta;
    expect(compose(t, { A: 'FALSE' })).toBe('no');
    expect(compose(t, { A: 'TRUE' })).toBe('sí');
  });

  it('2b. un respaldo en una rama que no se toma tampoco declara', () => {
    const t = '{{IF A}}{{DECLARE_UNDEF X="rama"}}{{ENDIF}}{{DECLARE_UNDEF X="fuera"}}[{{X}}]';
    expect(compose(t, { A: 'FALSE' })).toBe('[fuera]');
    expect(compose(t, { A: 'TRUE' })).toBe('[rama]');
  });

  it('2c. tras un EXIT_INCLUDE que se cumple, el respaldo del resto del párrafo no cuenta', async () => {
    const repo = repositorioDeMapa({ PARR_P: '{{IF SALIR}}{{EXIT_INCLUDE}}{{ENDIF}}{{DECLARE_UNDEF X="p"}}' });
    const { texto } = await expandirIncludes('{{INCLUDE PARR_P}}{{DECLARE_UNDEF X="después"}}[{{X}}]', repo);
    expect(compose(texto, { SALIR: 'TRUE' })).toBe('[después]');
    expect(compose(texto, { SALIR: 'FALSE' })).toBe('[p]');
  });

  it('3. un dato del caso cuenta como declarado y no se pisa; vacío no cuenta', () => {
    const t = '{{DECLARE_UNDEF X AS BOOL=FALSE}}' + pinta;
    expect(compose(t, { X: 'TRUE' })).toBe('sí');
    expect(compose(t, { X: '' })).toBe('no');
    expect(resolverDeclarados(t, { X: 'TRUE' })).toEqual({});
  });

  it('4. el DECLARE no cambia: uno posterior pisa al respaldo y sigue pisando al dato del caso', () => {
    const t = '{{DECLARE_UNDEF X AS BOOL=FALSE}}{{DECLARE X AS BOOL=TRUE}}' + pinta;
    expect(compose(t, {})).toBe('sí');
    expect(compose('{{DECLARE X AS BOOL=TRUE}}' + pinta, { X: 'FALSE' })).toBe('sí');
  });

  it('el valor de un respaldo abre las condiciones que dependen de él (se itera hasta que no cambia)', () => {
    const t = '{{DECLARE_UNDEF X AS BOOL=TRUE}}{{IF X}}{{DECLARE_UNDEF Y="por X"}}{{ENDIF}}{{DECLARE_UNDEF Y="otro"}}[{{Y}}]';
    expect(compose(t, {})).toBe('[por X]');
  });

  it('la directiva no deja rastro en la salida, ni en la vista previa', () => {
    expect(compose('a\n{{DECLARE_UNDEF X="v"}}\nb {{X}}', {})).toBe('a\nb v');
    expect(composeForPreview('{{DECLARE_UNDEF X="v"}}[{{X}}]', {})).toBe('[v]');
  });

  it('el sufijo de un INCLUDE renombra el campo del respaldo', () => {
    expect(applyFieldSuffix('{{DECLARE_UNDEF X AS BOOL=FALSE}}{{IF X}}a{{ENDIF}}', '_VEND')).toBe(
      '{{DECLARE_UNDEF X_VEND AS BOOL=FALSE}}{{IF X_VEND}}a{{ENDIF}}',
    );
  });
});

describe('DECLARE_UNDEF · parser, validador y campos', () => {
  it('se lee como un DECLARE marcado, con su tipo y su valor', () => {
    const [f] = parseFields('{{DECLARE_UNDEF ES_ACTO_SIN_TRANSMISION AS BOOL=FALSE}}');
    expect(f.fieldType).toBe('declare');
    expect(f.name).toBe('ES_ACTO_SIN_TRANSMISION');
    expect(f.declareType).toBe('BOOL');
    expect(f.declareValue).toBe('FALSE');
    expect(f.declareSoloSiIndefinido).toBe(true);
    expect(f.raw).toBe('{{DECLARE_UNDEF ES_ACTO_SIN_TRANSMISION AS BOOL=FALSE}}');
    expect(parseFields('{{DECLARE X=1}}')[0].declareSoloSiIndefinido).toBe(false);
  });

  it('un DECLARE y un respaldo del mismo campo en un fichero no son duplicado; dos respaldos sí', () => {
    const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);
    expect(codigos('{{DECLARE X AS BOOL=TRUE}}{{DECLARE_UNDEF X AS BOOL=FALSE}}{{IF X}}a{{ENDIF}}')).not.toContain('E050');
    expect(codigos('{{DECLARE_UNDEF X=1}}{{DECLARE_UNDEF X=2}}{{X}}')).toContain('E050');
    expect(codigos('{{DECLARE_UNDEF X AS BOOL=FALSE}}{{IF X}}a{{ENDIF}}')).toEqual([]);
  });

  it('avisa de las formas sin efecto: sin valor fijo (W914) y de lista (E908)', () => {
    const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);
    expect(codigos('{{DECLARE_UNDEF X AS BOOL:INPUT(¿X?|TRUE,FALSE)}}{{IF X}}a{{ENDIF}}')).toContain('W914');
    expect(codigos('{{DECLARE_UNDEF ARRAY L:[a,b]}}')).toContain('E908');
  });

  it('es un campo auxiliar, como DECLARE: no se pide', () => {
    const esq = esquemaDeCampos('{{DECLARE_UNDEF X AS BOOL=FALSE}}{{IF X}}a{{ENDIF}}', {});
    const x = esq.campos.find((c: { nombre: string }) => c.nombre === 'X');
    expect(x?.soloCondicional).toBe(true);
  });
});
