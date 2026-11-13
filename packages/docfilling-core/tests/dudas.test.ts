// Lo que nadie ha confirmado (13-nov-2026, Carles): la rama que decide un campo sin contestar o por defecto sale marcada.
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics, compose, quitarMarcasDeDuda, MARCA_DUDA } from '../index';

const T = '{{DECLARE TIENE_DESCENDENCIA:CHECKBOX}}{{DECLARE TESTADOR_FIRMA:CHECKBOX}}'
  + 'Comparece.\n{{IF TIENE_DESCENDENCIA}}Tiene hijos.{{ELSE}}Declara carecer de descendencia.{{ENDIF}}\n'
  + '{{IF TESTADOR_FIRMA}}Lo firma.{{ENDIF}}\nFin.';
const dudoso = (sin: string[], defecto: string[] = []) => (c: string) =>
  sin.includes(c) ? 'sin' as const : defecto.includes(c) ? 'defecto' as const : null;

describe('marcas de duda', () => {
  it('sin la opción, la salida no cambia', () => {
    const v = { TESTADOR_FIRMA: 'TRUE' };
    expect(composeWithDiagnostics(T, v).text).toBe(compose(T, v));
    expect(compose(T, v)).not.toContain('⟬');
  });

  it('marca la rama elegida con su nivel y su campo; lo confirmado no', () => {
    const r = composeWithDiagnostics(T, { TESTADOR_FIRMA: 'TRUE' }, 'es', { dudoso: dudoso(['TIENE_DESCENDENCIA']) }).text;
    expect(r).toContain('⟬?sin:TIENE_DESCENDENCIA⟭Declara carecer de descendencia.⟬/⟭');
    expect(r).toContain('Lo firma.');
    expect(r).not.toContain('TESTADOR_FIRMA');
    expect(quitarMarcasDeDuda(r)).toBe(compose(T, { TESTADOR_FIRMA: 'TRUE' }));
  });

  it('por defecto es el nivel suave, y una rama vacía deja su marca vacía', () => {
    const r = composeWithDiagnostics(T, { TESTADOR_FIRMA: 'FALSE', TIENE_DESCENDENCIA: 'TRUE' }, 'es',
      { dudoso: dudoso([], ['TESTADOR_FIRMA']) }).text;
    expect(r).toContain('⟬?defecto:TESTADOR_FIRMA⟭⟬/⟭');
    expect(r).toContain('Tiene hijos.');
  });

  it('sólo si lo dudoso decide: un AND con lo confirmado en falso no se marca', () => {
    const t = '{{DECLARE A:CHECKBOX}}{{DECLARE B:CHECKBOX}}{{IF A AND B}}Sí.{{ELSE}}No.{{ENDIF}}';
    expect(composeWithDiagnostics(t, { A: 'FALSE' }, 'es', { dudoso: dudoso(['B']) }).text).toBe('No.');
    expect(composeWithDiagnostics(t, { A: 'TRUE' }, 'es', { dudoso: dudoso(['B']) }).text).toBe('⟬?sin:B⟭No.⟬/⟭');
  });

  it('una constante de la plantilla y lo que fija un SET no son dudosos', () => {
    const t = '{{DECLARE C = "TRUE"}}{{SET D = "TRUE"}}{{IF C}}c{{ENDIF}}{{IF D}}d{{ENDIF}}';
    expect(composeWithDiagnostics(t, {}, 'es', { dudoso: () => 'sin' }).text).toBe('cd');
  });

  it('anidadas: cada condición dudosa con su marca', () => {
    const t = '{{IF A}}x{{IF B}}y{{ENDIF}}{{ENDIF}}';
    const r = composeWithDiagnostics(t, { A: 'TRUE' }, 'es', { dudoso: dudoso(['B']) }).text;
    expect(r).toBe('x⟬?sin:B⟭⟬/⟭');
    expect([...r.matchAll(MARCA_DUDA)].map((m) => m[1] ?? '/')).toEqual(['sin', '/']);
  });
});
