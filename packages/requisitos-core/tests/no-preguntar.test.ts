// NO_PREGUNTAR (23-nov-2026, #1101/#1102): GLOBAL pregunta a todos los actos el estado civil y la vecindad civil, y en
// las cancelaciones (13A) no hacen falta. Una fila más específica NO_PREGUNTAR los quita sin presumirles un valor.
import { describe, it, expect } from 'vitest';
import { componerTransversales, casoGeneral } from '../src/escenario';
import type { FilaTransversal } from '../src/puerto';

const fila = (ambito: string, fichero: string, fact: string, modo: string, valor: unknown = null): FilaTransversal => ({
  ambito, fichero, fact, modo, valor, objetoTipoCodigo: '', ccaaCodigo: '', tema: null, situacion: null, porQue: `de ${fichero}`,
});
const GLOBAL = [
  fila('TODOS', 'GLOBAL', 'SUJETO.ESTADO_CIVIL', 'PREGUNTAR'),
  fila('TODOS', 'GLOBAL', 'SUJETO.VECINDAD_CIVIL', 'PREGUNTAR'),
  fila('TODOS', 'GLOBAL', 'SUJETO.TIPO_DOCUMENTO', 'PREGUNTAR'),
];
const padres = new Map<string, string | null>();

describe('NO_PREGUNTAR en las presunciones transversales', () => {
  it('la subfamilia quita lo que GLOBAL pregunta, sin presumirlo', () => {
    const e = componerTransversales(casoGeneral('1302'), [
      ...GLOBAL,
      fila('SUBFAMILIA', '13A', 'SUJETO.ESTADO_CIVIL', 'NO_PREGUNTAR'),
      fila('SUBFAMILIA', '13A', 'SUJETO.VECINDAD_CIVIL', 'NO_PREGUNTAR'),
    ], {}, padres);
    expect(e.preguntarSiempre.map((q) => q.fact)).toEqual(['SUJETO.TIPO_DOCUMENTO']);
    expect(e.presunciones).toEqual([]);
  });

  it('gana la fila más específica: GLOBAL NO_PREGUNTAR no quita lo que la familia pregunta', () => {
    const e = componerTransversales(casoGeneral('1302'), [
      fila('TODOS', 'GLOBAL', 'SUJETO.ESTADO_CIVIL', 'NO_PREGUNTAR'),
      fila('FAMILIA', 'F13', 'SUJETO.ESTADO_CIVIL', 'PREGUNTAR'),
    ], {}, padres);
    expect(e.preguntarSiempre.map((q) => q.fact)).toEqual(['SUJETO.ESTADO_CIVIL']);
  });

  it('el escenario del acto manda sobre una NO_PREGUNTAR heredada', () => {
    const base = { ...casoGeneral('1302'), preguntarSiempre: [{ fact: 'SUJETO.ESTADO_CIVIL', porQue: 'lo pide el acto' }] };
    const e = componerTransversales(base, [...GLOBAL, fila('SUBFAMILIA', '13A', 'SUJETO.ESTADO_CIVIL', 'NO_PREGUNTAR')], {}, padres);
    expect(e.preguntarSiempre.find((q) => q.fact === 'SUJETO.ESTADO_CIVIL')?.porQue).toBe('lo pide el acto');
  });

  it('una presunción más específica también puede quitarse: NO_PREGUNTAR sobre PRESUMIR', () => {
    const e = componerTransversales(casoGeneral('1302'), [
      fila('FAMILIA', 'F13', 'SUJETO.ES_CONSUMIDOR', 'PRESUMIR', true),
      fila('SUBFAMILIA', '13A', 'SUJETO.ES_CONSUMIDOR', 'NO_PREGUNTAR'),
    ], {}, padres);
    expect(e.presunciones).toEqual([]);
    expect(e.preguntarSiempre).toEqual([]);
  });
});
