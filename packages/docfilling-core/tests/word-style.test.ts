// `{{WORD_STYLE:Nombre}}` — el estilo de párrafo de la plantilla.
//
// Como `{{PAGEBREAK}}`, es una de las dos directivas que sobreviven intactas
// a `compose`: el motor devuelve markdown y sólo la fusión sabe de estilos.
import { describe, it, expect } from 'vitest';
import {
  compose, parseFields, validateText, applyFieldSuffix, stripDirectives,
  expandirIncludes, repositorioDeMapa, FieldType,
  esWordStyle, nombreDeEstilo, estilosUsados, directivaWordStyle,
} from '../index';

describe('{{WORD_STYLE:...}}', () => {
  it('tiene tipo propio y expone el nombre del estilo', () => {
    const f = parseFields('{{WORD_STYLE:Formula notarial}}')[0];
    expect(f.fieldType).toBe(FieldType.WORD_STYLE);
    expect(f.name).toBe('Formula notarial');
  });

  it('admite acentos, espacios y mayúsculas en el nombre', () => {
    expect(nombreDeEstilo('WORD_STYLE: Fórmula notarial (centrada)')).toBe('Fórmula notarial (centrada)');
    expect(esWordStyle('word_style:X')).toBe(true);
    expect(esWordStyle('WORD_STYLE :X')).toBe(true);
  });

  it('no se confunde con un campo que empiece igual', () => {
    expect(esWordStyle('WORD_STYLES')).toBe(false);
    expect(esWordStyle('WORD_STYLE')).toBe(false); // sin nombre no es nada
    expect(nombreDeEstilo('WORD_STYLE:   ')).toBeNull();
  });

  it('sobrevive a compose, no sale como [NO DISPONIBLE]', () => {
    const salida = compose('{{WORD_STYLE:Formula}}**{{X}}**', { X: 'OTORGAN' });
    expect(salida).toContain('{{WORD_STYLE:Formula}}');
    expect(salida).not.toContain('NO DISPONIBLE');
    expect(salida).toContain('OTORGAN');
  });

  it('no pide DECLARE', () => {
    expect(validateText('{{WORD_STYLE:Formula}}texto').diagnostics).toEqual([]);
  });

  it('el sufijo de FIELDS no toca el nombre del estilo, y sí los campos', () => {
    expect(applyFieldSuffix('{{WORD_STYLE:Formula}}{{X}}', '_A'))
      .toBe('{{WORD_STYLE:Formula}}{{X_A}}');
  });

  it('sigue intacta dentro de un INCLUDE con sufijo', async () => {
    const repo = repositorioDeMapa({ P: '{{WORD_STYLE:Formula}}**{{X}}**' });
    const r = await expandirIncludes('{{INCLUDE P FIELDS:_A}}', repo);
    expect(r.texto).toContain('{{WORD_STYLE:Formula}}');
  });

  it('no la retira stripDirectives', () => {
    expect(stripDirectives('{{WORD_STYLE:F}}texto')).toContain('{{WORD_STYLE:F}}');
  });

  it('estilosUsados saca la lista para validar la plantilla', () => {
    const t = [
      '{{WORD_STYLE:Formula notarial}}OTORGAN',
      '{{WORD_STYLE:Bloque de firma}}firma',
      '{{WORD_STYLE:Formula notarial}}ME REQUIEREN',
    ].join('\n\n');
    expect(estilosUsados(t)).toEqual(['Formula notarial', 'Bloque de firma']);
  });

  it('estilosUsados sobre un texto sin estilos da lista vacía', () => {
    expect(estilosUsados('texto normal')).toEqual([]);
  });

  it('directivaWordStyle construye la forma canónica', () => {
    expect(directivaWordStyle('Formula notarial')).toBe('{{WORD_STYLE:Formula notarial}}');
  });
});
