// SET y DECLARE en orden de documento (Carles, 10-nov-2026): un `{{SET X=v}}` de una rama viva lo ven los IF que van
// detrás, y un `{{DECLARE X=v}}` dentro de un IF que no se toma no cuenta. Antes el SET sólo cambiaba lo impreso y el
// DECLARE valía siempre.
import { describe, it, expect } from 'vitest';
import { compose, resolverDeclarados, asignacionesEnOrden, constantesFijas, validateText } from '../index';

const CARLES =
  '{{IF CAMPO1}}{{SET CAMPO2=X}}{{ELSE}}{{SET CAMPO2=Y}}{{IF CAMPO3}}{{SET CAMPO2=Z}}{{ENDIF}}{{ENDIF}}' +
  '[{{CAMPO2}}]{{IF CAMPO2=="Y"}} abre-Y{{ENDIF}}{{IF CAMPO2=="Z"}} abre-Z{{ENDIF}}{{IF CAMPO2=="X"}} abre-X{{ENDIF}}';

describe('SET · lo ven los IF de después', () => {
  it('el ejemplo de Carles: rama, anidado y la última asignación ganan', () => {
    expect(compose(CARLES, { CAMPO1: 'TRUE' })).toBe('[X] abre-X');
    expect(compose(CARLES, { CAMPO1: 'FALSE', CAMPO3: 'FALSE' })).toBe('[Y] abre-Y');
    expect(compose(CARLES, { CAMPO1: 'FALSE', CAMPO3: 'TRUE' })).toBe('[Z] abre-Z');
  });

  it('un SET en una rama muerta no cuenta', () => {
    expect(compose('{{IF A}}{{SET B=TRUE}}{{ENDIF}}{{IF B}}sí{{ELSE}}no{{ENDIF}}', { A: 'FALSE' })).toBe('no');
  });

  it('un IF ANTES del SET no lo ve; lo impreso sigue llevando el último valor', () => {
    expect(compose('{{IF B=="v"}}antes{{ENDIF}}{{SET B=v}}{{IF B=="v"}}después{{ENDIF}}', {})).toBe('después');
  });

  it('el SET pisa lo contestado desde su sitio', () => {
    expect(compose('{{IF B=="a"}}1{{ENDIF}}{{SET B=b}}{{IF B=="b"}}2{{ENDIF}}', { B: 'a' })).toBe('12');
  });
});

describe('DECLARE fijo · sólo en la rama que se toma', () => {
  const T = '{{IF A}}{{DECLARE B=TRUE}}{{ENDIF}}B={{IF B}}sí{{ELSE}}no{{ENDIF}}';
  it('vale si la rama se toma', () => {
    expect(compose(T, { A: 'TRUE' })).toBe('B=sí');
    expect(resolverDeclarados(T, { A: 'TRUE' })).toEqual({ B: 'TRUE' });
  });
  it('no vale si no se toma: el campo queda con lo contestado', () => {
    expect(compose(T, { A: 'FALSE' })).toBe('B=no');
    expect(resolverDeclarados(T, { A: 'FALSE' })).toEqual({});
    expect(compose(T, { A: 'FALSE', B: 'TRUE' })).toBe('B=sí');
  });
  it('fuera de un IF vale siempre, como antes', () => {
    expect(resolverDeclarados('{{DECLARE B=TRUE}}{{IF A}}x{{ENDIF}}', {})).toEqual({ B: 'TRUE' });
  });
});

describe('asignacionesEnOrden · para quien pregunta antes de componer', () => {
  const desconocido = (vals: Record<string, string>) => (c: string) => !(c in vals);
  it('decidido: el valor del SET', () => {
    const v = { CAMPO1: 'FALSE', CAMPO3: 'TRUE' };
    expect(asignacionesEnOrden(CARLES, v, desconocido(v))).toEqual({ valores: { CAMPO2: 'Z' }, inciertos: new Set() });
  });
  it('sin decidir: el campo queda incierto, no vacío', () => {
    const v = {};
    const r = asignacionesEnOrden(CARLES, v, desconocido(v));
    expect(r.valores).toEqual({});
    expect([...r.inciertos]).toEqual(['CAMPO2']);
  });
  it('un SET seguro después de uno incierto lo deja cierto', () => {
    const v = {};
    expect(asignacionesEnOrden('{{IF A}}{{SET B=1}}{{ENDIF}}{{SET B=2}}', v, desconocido(v)).valores).toEqual({ B: '2' });
  });
});

describe('constantesFijas', () => {
  it('sólo los campos que no tienen más que DECLARE fijos', () => {
    const t = '{{IF A}}{{DECLARE C=FALSE}}{{ENDIF}}{{DECLARE D=1}}{{DECLARE D:INPUT(¿D?)}}{{DECLARE_UNDEF E=1}}{{DECLARE F AS BOOL=TRUE}}';
    expect([...constantesFijas(t)].sort()).toEqual(['C', 'F']);
  });
});

describe('validador · W915 / W916', () => {
  const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code).filter((c) => c === 'W915' || c === 'W916');
  it('W915: SET detrás del IF que lo lee', () => {
    expect(codigos('{{IF B=="v"}}x{{ENDIF}}\n{{SET B=v}}')).toEqual(['W915']);
    expect(codigos('{{SET B=v}}\n{{IF B=="v"}}x{{ENDIF}}')).toEqual([]);
  });
  it('W916: DECLARE fijo dentro de un IF y leído fuera', () => {
    expect(codigos('{{IF A}}\n{{DECLARE B AS BOOL=FALSE}}\n{{ENDIF}}\n{{IF B}}x{{ENDIF}}')).toEqual(['W916']);
    expect(codigos('{{IF A}}\n{{DECLARE B AS BOOL=FALSE}}\n{{IF B}}x{{ENDIF}}\n{{ENDIF}}')).toEqual([]);
    expect(codigos('{{DECLARE B AS BOOL=TRUE}}\n{{IF A}}\n{{DECLARE B AS BOOL=FALSE}}\n{{ENDIF}}\n{{IF B}}x{{ENDIF}}')).toEqual([]);
  });
});
