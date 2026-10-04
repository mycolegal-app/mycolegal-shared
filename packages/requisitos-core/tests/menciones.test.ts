import { describe, it, expect } from 'vitest';
import { esMencion } from '../src/menciones';

/**
 * D2 del plan de registrabilidad: qué reglas del golden entran en el checklist del
 * Revisor. Equivocarse aquí cuesta en las dos direcciones —pedir al modelo que busque en
 * la escritura una nota simple que solo se recaba, o callar una manifestación que sí
 * tiene que constar—, así que el criterio se fija en una prueba.
 */
describe('esMencion (D2)', () => {
  it('un documento que solo se aporta no es una mención', () => {
    expect(esMencion({ tratamientoInstrumento: 'NINGUNO', modoCumplimiento: 'APORTACION' })).toBe(false);
  });

  it('lo que se reseña, incorpora, testimonia o protocoliza tiene que constar', () => {
    for (const t of ['RESENAR', 'INCORPORAR', 'TESTIMONIAR', 'PROTOCOLIZAR']) {
      expect(esMencion({ tratamientoInstrumento: t, modoCumplimiento: 'APORTACION' }), t).toBe(true);
    }
  });

  it('manifestación, actuación, comparecencia y consulta se comprueban en el texto', () => {
    for (const m of ['MANIFESTACION', 'ACTUACION', 'COMPARECENCIA', 'CONSULTA']) {
      expect(esMencion({ tratamientoInstrumento: 'NINGUNO', modoCumplimiento: m }), m).toBe(true);
    }
  });

  it('un requisito local de la organización (sin golden) no es mención', () => {
    expect(esMencion({ tratamientoInstrumento: null, modoCumplimiento: null })).toBe(false);
  });
});
