// `:HUMAN_INPUT(…)` (26-nov-2026, encargo de Carles vía Redactor): como `:INPUT(…)`, pero el dato lo da SIEMPRE una
// persona. Caso real: ACCION_REGISTRO («Acción en el Registro», VAR_EXP_C_DIRECTOR) es una decisión de la otorgante y
// MycoBot la contestaba «No desea» al leer un encargo de Notaría; la obra nueva salía bloqueada.
import { describe, it, expect } from 'vitest';
import { compose, parseFields, validateText, esquemaDeCampos, QUIEN } from '../index';

const DECL =
  '{{DECLARE ACCION_REGISTRO:HUMAN_INPUT(Acción en el Registro|No desea iniciar expediente,Sí desea modificar el Registro):[Lo decide la otorgante]}}';
const PLANTILLA = `${DECL}Texto.{{IF ACCION_REGISTRO == "Sí desea modificar el Registro"}} Solicita la modificación.{{ENDIF}}`;

describe('HUMAN_INPUT', () => {
  it('DECLARE X:HUMAN_INPUT se lee como un INPUT: nombre, etiqueta y opciones', () => {
    const f = parseFields(DECL)[0];
    expect(f.name).toBe('ACCION_REGISTRO');
    expect(f.soloPersona).toBe(true);
    expect(f.inputDescription).toBe('Acción en el Registro');
    expect(f.inputOptions).toEqual(['No desea iniciar expediente', 'Sí desea modificar el Registro']);
    expect(f.declareInstruction).toBe('Lo decide la otorgante');
  });

  it('en el esquema: quien = persona y soloPersona, con su pregunta y opciones', () => {
    const c = esquemaDeCampos(PLANTILLA).campos.find((x) => x.nombre === 'ACCION_REGISTRO')!;
    expect(c.quien).toBe(QUIEN.PERSONA);
    expect(c.soloPersona).toBe(true);
    expect(c.pregunta).toBe('Acción en el Registro');
    expect(c.opciones).toEqual(['No desea iniciar expediente', 'Sí desea modificar el Registro']);
  });

  it('un DECLARE … :INPUT normal sigue siendo de la IA', () => {
    const c = esquemaDeCampos(PLANTILLA.replace('HUMAN_INPUT', 'INPUT')).campos.find((x) => x.nombre === 'ACCION_REGISTRO')!;
    expect(c.quien).toBe(QUIEN.IA);
    expect(c.soloPersona).toBe(false);
  });

  it('manda aunque la primera aparición sea una referencia', () => {
    const c = esquemaDeCampos(`{{ACCION_REGISTRO}} ${DECL}`).campos.find((x) => x.nombre === 'ACCION_REGISTRO')!;
    expect(c.quien).toBe(QUIEN.PERSONA);
  });

  it('el DECLARE no imprime nada y la condición funciona', () => {
    expect(compose(PLANTILLA, { ACCION_REGISTRO: 'Sí desea modificar el Registro' })).toBe('Texto. Solicita la modificación.');
    expect(compose(PLANTILLA, { ACCION_REGISTRO: 'No desea iniciar expediente' })).toBe('Texto.');
  });

  it('{{X:HUMAN_INPUT(…)}} en el texto se imprime como un INPUT y es de persona', () => {
    const t = 'Acción: {{ACCION_REGISTRO:HUMAN_INPUT(Acción en el Registro|No,Sí)}}.';
    expect(compose(t, { ACCION_REGISTRO: 'Sí' })).toBe('Acción: Sí.');
    const c = esquemaDeCampos(t).campos.find((x) => x.nombre === 'ACCION_REGISTRO')!;
    expect(c.quien).toBe(QUIEN.PERSONA);
    expect(c.soloPersona).toBe(true);
    expect(c.opciones).toEqual(['No', 'Sí']);
  });

  it('el validador lo acepta igual que un INPUT', () => {
    const humano = validateText(PLANTILLA);
    const normal = validateText(PLANTILLA.replace('HUMAN_INPUT', 'INPUT'));
    const codigos = (r: typeof humano) => r.diagnostics.map((d) => d.code).sort();
    expect(codigos(humano)).toEqual(codigos(normal));
    expect(humano.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
