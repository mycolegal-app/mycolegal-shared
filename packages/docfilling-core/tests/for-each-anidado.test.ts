// FOR EACH anidado. Hasta el 5-oct-2026 una regex perezosa emparejaba el FOR
// exterior con el ENDFOR interior, no reconocía `IN ITEM.ANEJOS` y dejaba un
// ENDFOR suelto: salía «[NO DISPONIBLE]» y, con IF alrededor, se comía texto
// anterior (así se perdía media escritura del 0412).
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics } from '../index';

const compone = (t: string, campos: Record<string, unknown>) =>
  (composeWithDiagnostics(t, campos as never) as { text: string }).text;

const ELEMENTOS = [
  { TIPO: 'VIVIENDA', NUMERO: '1', ANEJOS: [{ TIPO: 'TRASTERO', NUMERO: 'T1' }, { TIPO: 'GARAJE', NUMERO: 'G1' }] },
  { TIPO: 'LOCAL', NUMERO: '2', ANEJOS: [] },
];

describe('FOR EACH anidado', () => {
  it('expande el interior dentro de cada elemento, con su propio ITEM', () => {
    const t = '{{FOR EACH ITEM IN ELEMENTOS_PH}}[{{ITEM.TIPO}} {{ITEM.NUMERO}}:{{FOR EACH ITEM IN ITEM.ANEJOS}} {{ITEM.TIPO}}-{{ITEM.NUMERO}}{{ENDFOR}}]{{ENDFOR}}';
    expect(compone(t, { ELEMENTOS_PH: ELEMENTOS })).toBe('[VIVIENDA 1: TRASTERO-T1 GARAJE-G1][LOCAL 2:]');
  });

  it('con iteradores de distinto nombre, el interior ve los dos', () => {
    const t = '{{FOR EACH E IN ELEMENTOS_PH}}{{FOR EACH A IN E.ANEJOS}}{{E.NUMERO}}/{{A.NUMERO}} {{ENDFOR}}{{ENDFOR}}';
    expect(compone(t, { ELEMENTOS_PH: ELEMENTOS })).toBe('1/T1 1/G1 ');
  });

  it('IF dentro del bucle interior ve el elemento interior', () => {
    const t = '{{FOR EACH ITEM IN ELEMENTOS_PH}}{{FOR EACH ITEM IN ITEM.ANEJOS}}{{IF ITEM.TIPO=="GARAJE"}}<{{ITEM.NUMERO}}>{{ENDIF}}{{ENDFOR}}{{ENDFOR}}';
    expect(compone(t, { ELEMENTOS_PH: ELEMENTOS })).toBe('<G1>');
  });

  it('no deja ENDFOR sueltos ni se come el texto de alrededor', () => {
    const t = 'ANTES {{FOR EACH ITEM IN L}}a{{ENDFOR}} MEDIO {{IF X}}{{FOR EACH ITEM IN M}}{{FOR EACH ITEM IN ITEM.N}}b{{ENDFOR}}{{ENDFOR}}{{ENDIF}} DESPUES';
    const r = compone(t, { X: 'TRUE' });
    expect(r).toBe('ANTES  MEDIO  DESPUES');
    expect(r).not.toContain('NO DISPONIBLE');
  });

  it('dos bucles hermanos siguen siendo independientes', () => {
    const t = '{{FOR EACH ITEM IN A}}{{ITEM}}{{ENDFOR}}|{{FOR EACH ITEM IN B}}{{ITEM}}{{ENDFOR}}';
    expect(compone(t, { A: ['1', '2'], B: ['x'] })).toBe('12|x');
  });
});

describe('FOR EACH … IN LISTA|ENUM', () => {
  const T = '{{FOR EACH ITEM IN S|ENUM}}**{{ITEM.N}}**, con DNI {{ITEM.D}}{{ENDFOR}}, han solicitado';
  it('une como enumeración en prosa', () => {
    expect(compone(T, { S: [{ N: 'Ana', D: '1' }, { N: 'Luis', D: '2' }, { N: 'Eva', D: '3' }] }))
      .toBe('**Ana**, con DNI 1, **Luis**, con DNI 2 y **Eva**, con DNI 3, han solicitado');
  });
  it('con uno solo no añade nada', () => {
    expect(compone(T, { S: [{ N: 'Ana', D: '1' }] })).toBe('**Ana**, con DNI 1, han solicitado');
  });
});
