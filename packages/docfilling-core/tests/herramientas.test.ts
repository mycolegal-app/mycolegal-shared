import { describe, it, expect } from 'vitest';
import {
  leerHerramientas, herramientasReferidas, sustituirHerramientas, diagnosticosHerramientas, claveHerramienta, idHerramienta,
} from '../src/syntax/herramientas';

describe('herramientas del motor: SYSTEM:HERRAMIENTA<…>', () => {
  it('lee la herramienta como una pieza, con campo y sin tocar el formato', () => {
    const [u] = leerHerramientas('Tel. {{SYSTEM:CONTACT<EULISES>.TELEFONO#upper}}.');
    expect(u.herramienta).toBe('CONTACT');
    expect(u.argumento).toBe('EULISES');
    expect(u.campo).toBe('TELEFONO');
    expect(u.crudo).toBe('SYSTEM:CONTACT<EULISES>.TELEFONO');
  });

  it('en una condición, el «>» de la herramienta no se confunde con el operador', () => {
    const [u] = leerHerramientas('{{IF SYSTEM:COMPUTE<PLAZO(ITP_AJD)> > 0}}x{{ENDIF}}');
    expect(u.argumento).toBe('PLAZO(ITP_AJD)');
    const s = sustituirHerramientas('{{IF SYSTEM:COMPUTE<PLAZO(ITP_AJD)> > 0}}x{{ENDIF}}');
    expect(s.texto).toMatch(/^\{\{IF __SYS_COMPUTE_[0-9a-f]{8} > 0\}\}x\{\{ENDIF\}\}$/);
  });

  it('SYSTEM:DATO (sin «<») no es herramienta', () => {
    expect(leerHerramientas('{{SYSTEM:NOMBRE_NOTARIO}} {{IF TOTAL <= 500000}}')).toEqual([]);
  });

  it('variables entre corchetes: se resuelven para pedir el cálculo; sin valor, no se pide', () => {
    const t = '{{SYSTEM:COMPUTE<PLAZO([IMPUESTO])>}} y {{SYSTEM:CONTACT<[GESTORIA]>.NOMBRE}}';
    expect(herramientasReferidas(t, { IMPUESTO: 'ITP_AJD' }).map((h) => h.clave)).toEqual(['COMPUTE<PLAZO(ITP_AJD)>']);
    const [c] = herramientasReferidas(t, { IMPUESTO: 'ITP_AJD' });
    expect(c.funcion).toEqual({ nombre: 'PLAZO', parametros: ['ITP_AJD'] });
  });

  it('sustituye por el valor calculado; sin valor queda el campo vacío (hueco visible del motor)', () => {
    const clave = claveHerramienta('COMPUTE', 'PLAZO(ITP_AJD)', null);
    const s = sustituirHerramientas('Plazo: {{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}}', {}, { [clave]: 'un mes' });
    const id = idHerramienta(clave);
    expect(s.texto).toBe(`Plazo: {{${id}}}`);
    expect(s.campos[id]).toBe('un mes');
    expect(s.nombres[id]).toBe('SYSTEM:COMPUTE<PLAZO(ITP_AJD)>');
    expect(sustituirHerramientas('{{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}}', {}, { [clave]: null }).campos).toEqual({});
  });

  it('fuera de las llaves no hay lenguaje', () => {
    expect(leerHerramientas('SYSTEM:COMPUTE<PLAZO(ITP_AJD)> suelto')).toEqual([]);
  });

  it('diagnósticos: sin cerrar, desconocida, función no declarada y aridad', () => {
    const fs = new Map([['PLAZO', { parametros: 1 }]]);
    const cod = (t: string) => diagnosticosHerramientas(t, fs).map((d) => d.codigo);
    expect(cod('{{SYSTEM:COMPUTE<PLAZO(ITP_AJD)}}')).toEqual(['E931']);
    expect(cod('{{SYSTEM:CALCULO<X>}}')).toEqual(['E930']);
    expect(cod('{{SYSTEM:COMPUTE<CUOTA(X)>}}')).toEqual(['E932']);
    expect(cod('{{SYSTEM:COMPUTE<PLAZO(A, B)>}}')).toEqual(['E933']);
    expect(cod('{{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}} {{SYSTEM:CONTACT<EULISES>.TELEFONO}}')).toEqual([]);
  });

  it('el mismo cálculo dos veces se pide una vez y comparte identificador', () => {
    const t = '{{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}} … {{SYSTEM:COMPUTE<PLAZO( ITP_AJD )>}}';
    expect(herramientasReferidas(t)).toHaveLength(1);
    const s = sustituirHerramientas(t);
    expect(new Set(s.texto.match(/__SYS_\w+/g))).toHaveProperty('size', 1);
  });
});

describe('herramientas de punta a punta: componer y validar', async () => {
  const { composeWithDiagnostics, composeForPreview } = await import('../src/compose/engine');
  const { validateText } = await import('../src/syntax/validate');
  const PLANT = 'Presentar en {{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}}.{{IF SYSTEM:COMPUTE<PLAZO(ITP_AJD)> == "un mes"}} (corto){{ENDIF}}';
  const CLAVE = 'COMPUTE<PLAZO(ITP_AJD)>';

  it('con resultado: se imprime y la condición lo lee', () => {
    const r = composeWithDiagnostics(PLANT, {}, 'es-ES', { herramientas: { [CLAVE]: 'un mes' } });
    expect(r.text).toContain('Presentar en un mes. (corto)');
  });

  it('sin resultado: hueco (nunca una cifra) y la condición no se cumple', () => {
    const r = composeWithDiagnostics(PLANT, {}, 'es-ES', { herramientas: {} });
    expect(r.text).not.toContain('un mes');
    expect(r.text).not.toContain('(corto)');
    expect(r.text).not.toContain('__SYS_');
  });

  it('en la vista previa, el hueco lleva el nombre de la herramienta', () => {
    expect(composeForPreview('Plazo: {{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}}', {}, 'es-ES')).toContain('{{SYSTEM:COMPUTE<PLAZO(ITP_AJD)>}}');
  });

  it('con formato detrás del cierre', () => {
    const r = composeWithDiagnostics('{{SYSTEM:CONTACT<EULISES>.NOMBRE#upper}}', {}, 'es-ES', { herramientas: { 'CONTACT<EULISES>.NOMBRE': 'e-ulises' } });
    expect(r.text).toContain('E-ULISES');
  });

  it('el validador da E931/E932 y no se queja de operadores en un IF con herramienta', () => {
    const fs = new Map([['PLAZO', { parametros: 1 }]]);
    const codigos = (t: string) => validateText(t, undefined, undefined, { funcionesCompute: fs }).diagnostics.map((d) => d.code);
    expect(codigos('{{IF SYSTEM:COMPUTE<PLAZO(ITP_AJD)> == "x"}}a{{ENDIF}}').filter((c) => c.startsWith('E'))).toEqual([]);
    expect(codigos('{{SYSTEM:COMPUTE<PLAZO(ITP_AJD)}}')).toContain('E931');
    expect(codigos('{{SYSTEM:COMPUTE<CUOTA(X)>}}')).toContain('E932');
  });
});
