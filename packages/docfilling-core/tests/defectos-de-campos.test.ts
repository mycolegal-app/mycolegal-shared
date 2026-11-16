// Los valores por defecto sin el resto del esquema (15-nov-2026): lo mismo que sacarlos de `esquemaDeCampos`.
import { describe, it, expect } from 'vitest';
import { defectosDeCampos, esquemaDeCampos } from '../index';

const deEsquema = (t: string) =>
  esquemaDeCampos(t).campos.filter((c) => c.porDefecto).map((c) => ({ nombre: c.nombre, porDefecto: c.porDefecto }));

describe('defectosDeCampos', () => {
  const PLANTILLA = [
    '{{DECLARE REGIMEN:INPUT(¿Régimen?|gananciales,separación)="gananciales"}}',
    '{{DECLARE TIPO_FINCA = "Urbana"}}',
    // la primera aparición manda: aquí sin defecto, después con él
    '{{PRECIO}} … {{DECLARE PRECIO:INPUT(¿Precio?)=1000}}',
    '{{DECLARE ARRAY COMPRADORES(NOMBRE, ESTADO)}}',
    '{{FOR EACH C IN COMPRADORES}}{{C.NOMBRE}}{{IF C.ESTADO == "Casado"}} casado{{ENDIF}}{{ENDFOR}}',
    '{{HUMAN_ACTION:revisar}}{{SYSTEM:FECHA}}',
  ].join('\n');

  it('da lo mismo que el esquema, en el mismo orden', () => {
    expect(defectosDeCampos(PLANTILLA)).toEqual(deEsquema(PLANTILLA));
    expect(defectosDeCampos(PLANTILLA).map((c) => c.nombre)).toContain('REGIMEN');
    expect(defectosDeCampos(PLANTILLA).map((c) => c.nombre)).not.toContain('PRECIO');
  });

  it('sin defectos, vacío', () => {
    expect(defectosDeCampos('Texto con {{NOMBRE}} y nada más')).toEqual([]);
  });
});
