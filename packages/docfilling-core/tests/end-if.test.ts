// `{{END IF}}` / `{{END_IF}}` — aceptadas por simetría con `{{END FOR}}`.
//
// Antes no cerraban el bloque, y el daño era mudo: el texto que debía proteger
// el `{{IF}}` se emitía SIEMPRE, más un `[NO DISPONIBLE]`. 12 casos en 6
// ficheros de `_PROD`, tres de ellos enrutados.
import { describe, it, expect } from 'vitest';
import { compose, parseFields, validateText, FieldType, normalizeConditionals } from '../index';

describe('{{END IF}} y {{END_IF}}', () => {
  it('son condicionales, no campos de datos', () => {
    for (const t of ['{{END IF}}', '{{END_IF}}', '{{end if}}']) {
      expect(parseFields(t)[0].fieldType, t).toBe(FieldType.CONDITIONAL);
    }
  });

  it('CIERRAN el bloque: con la condición en falso el texto NO sale', () => {
    for (const cierre of ['{{END IF}}', '{{END_IF}}']) {
      const t = `{{IF X}}\nTexto protegido.\n${cierre}`;
      const salida = compose(t, { X: '' });
      expect(salida, cierre).not.toContain('Texto protegido.');
      expect(salida, cierre).not.toContain('[NO DISPONIBLE]');
    }
  });

  it('y dejan salir el texto cuando la condición es cierta', () => {
    expect(compose('{{IF X}}\nTexto protegido.\n{{END IF}}', { X: 'Sí' }))
      .toContain('Texto protegido.');
  });

  it('se normalizan a la forma canónica antes de componer', () => {
    expect(normalizeConditionals('{{IF X}}a{{END IF}}')).toBe('{{IF X}}a{{ENDIF}}');
    expect(normalizeConditionals('{{IF X}}a{{END_IF}}')).toBe('{{IF X}}a{{ENDIF}}');
  });

  it('el validador ya no ve un IF sin cerrar, y avisa con W903', () => {
    const d = validateText('{{IF X}}\na\n{{END IF}}').diagnostics;
    expect(d.filter((x) => x.code === 'E010')).toHaveLength(0);
    const w = d.filter((x) => x.code === 'W903');
    expect(w).toHaveLength(1);
    expect(w[0].fix?.replacement).toBe('{{ENDIF}}');
  });

  it('{{ENDIF}} canónico no se queja', () => {
    expect(validateText('{{IF X}}a{{ENDIF}}').diagnostics.filter((d) => d.code === 'W903')).toEqual([]);
  });

  it('no confunde {{END FOR}}, que ya tenía su propio aviso', () => {
    const d = validateText('{{FOR EACH I IN L}}x{{END FOR}}').diagnostics;
    expect(d.filter((x) => x.code === 'W903')).toEqual([]);
    expect(d.some((x) => x.code === 'W082')).toBe(true);
  });

  it('ni {{ENDIF X}}, que es la forma heredada con nombre (W080)', () => {
    const d = validateText('{{IF X}}a{{ENDIF X}}').diagnostics;
    expect(d.filter((x) => x.code === 'W903')).toEqual([]);
  });
});
