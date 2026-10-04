// `analizarBiblioteca` — los tres defectos que no dan diagnóstico (F1.9b).
//
// Cada caso reproduce en pequeño una forma encontrada en `_PROD` el 2-oct-2026,
// y la pareja «defecto / ya reparado» es lo que demuestra que la regla sirve:
// si sólo se probara el caso roto, una regla que dijera «sí» siempre pasaría.
import { describe, it, expect } from 'vitest';
import { analizarBiblioteca, type Documento } from '../index';

const doc = (nombre: string, texto: string): Documento => ({ nombre, texto });

describe('analizarBiblioteca', () => {
  it('huérfano: existe y nadie lo incluye', async () => {
    const a = await analizarBiblioteca([
      doc('ENR', '{{INCLUDE PARR_A}}'),
      doc('PARR_A', 'Cláusula A.'),
      doc('PARR_B', 'Cláusula B, que nadie pide.'),
    ], [doc('ESQ', '{{INCLUDE ENR}}')]);
    expect(a.huerfanos).toEqual(['PARR_B']);
  });

  it('un esquema no es huérfano: es punto de entrada', async () => {
    const a = await analizarBiblioteca([doc('PARR_A', 'A')], [doc('ESQ', '{{INCLUDE PARR_A}}')]);
    expect(a.huerfanos).toEqual([]);
  });

  it('enrutador vacío: resuelve sin aviso y no emite nada', async () => {
    const a = await analizarBiblioteca([
      doc('ENR_VACIO', ''),
      doc('PARR_A', 'A'),
    ], [doc('ESQ', '{{INCLUDE ENR_VACIO}}')]);
    expect(a.vaciosReferenciados).toEqual(['ENR_VACIO']);
    // PARR_A está vacío de referencias pero NO vacío de contenido: son cosas
    // distintas y no hay que confundirlas.
    expect(a.vacios).toEqual(['ENR_VACIO']);
    expect(a.huerfanos).toEqual(['PARR_A']);
  });

  it('casi vacío: el enrutador con un solo INCLUDE, el patrón de «a medias»', async () => {
    const a = await analizarBiblioteca([
      doc('ENR', '{{INCLUDE PARR_A}}\n'),
      doc('PARR_A', 'A'.repeat(200)),
    ], [doc('ESQ', '{{INCLUDE ENR}}')]);
    expect(a.casiVacios).toContain('ENR');
    expect(a.casiVacios).not.toContain('PARR_A');
  });

  // ── el caso de Álava, que es el que costó encontrar ──────────────────────
  const alavaRoto = () => [
    // El VAR declara la variable… y nadie lo incluye.
    doc('VAR_T', '{{DECLARE ISD_X AS BOOL}}'),
    doc('PARR_X', '{{IF ISD_X}}Reducción.{{ENDIF}}'),
    doc('ENR', '{{INCLUDE PARR_X}}'),
  ];

  it('condición cuyo único declarante es huérfano: el IF no puede ser cierto nunca', async () => {
    const a = await analizarBiblioteca(alavaRoto(), [doc('ESQ', '{{INCLUDE ENR}}')]);
    expect(a.condicionesSinDeclaracionAlcanzable).toHaveLength(1);
    const c = a.condicionesSinDeclaracionAlcanzable[0];
    expect(c.nombre).toBe('ISD_X');
    expect(c.usadaEn).toEqual(['PARR_X']);
    expect(c.declaradaEnHuerfanos).toEqual(['VAR_T']);
  });

  it('y deja de señalarla en cuanto el párrafo incluye su VAR (el arreglo real)', async () => {
    const a = await analizarBiblioteca([
      doc('VAR_T', '{{DECLARE ISD_X AS BOOL}}'),
      doc('PARR_X', '{{INCLUDE VAR_T}}\n\n{{IF ISD_X}}Reducción.{{ENDIF}}'),
      doc('ENR', '{{INCLUDE PARR_X}}'),
    ], [doc('ESQ', '{{INCLUDE ENR}}')]);
    expect(a.condicionesSinDeclaracionAlcanzable).toEqual([]);
    expect(a.huerfanos).toEqual([]);
  });

  it('no señala lo normal: la variable la declara el maestro, que sí es alcanzable', async () => {
    const a = await analizarBiblioteca([
      doc('PARR_X', '{{IF ISD_X}}Reducción.{{ENDIF}}'),
    ], [doc('ESQ', '{{DECLARE ISD_X AS BOOL}}\n{{INCLUDE PARR_X}}')]);
    expect(a.condicionesSinDeclaracionAlcanzable).toEqual([]);
  });

  it('INCLUDE sin resolver, con cuántos lo piden', async () => {
    const a = await analizarBiblioteca([
      doc('A', '{{INCLUDE NO_EXISTE}}'),
      doc('B', '{{INCLUDE NO_EXISTE}}'),
    ]);
    expect(a.faltantes.get('NO_EXISTE')).toBe(2);
  });

  it('nombres repetidos en carpetas distintas', async () => {
    const a = await analizarBiblioteca([doc('P', 'uno'), doc('P', 'otro')]);
    expect(a.nombresRepetidos).toEqual(['P']);
  });
});
