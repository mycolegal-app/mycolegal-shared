// Plan PLAZOS_PRESENTACION_CCAA (24-nov-2026): la resolución sólo recorre lo que dice el catálogo. Los códigos de
// este test son datos de PRUEBA, no del motor.
import { describe, it, expect } from 'vitest';
import { plazoDeImpuesto, type TablaPlazos } from '../src/plazos';

const TABLA: TablaPlazos = {
  resolucion: {
    porDefecto: 'ESTATAL',
    equivalencias: { EXTRANJERO: 'ESTATAL' },
    sinPlazoUnico: [{ valor: 'MIXTA', aviso: 'varias comunidades' }],
    siNoConsta: { ccaa: 'NOTARIA', aviso: 'supuesto {ccaa}' },
  },
  impuestos: [{
    codigo: 'ITP_AJD',
    puntoConexion: [
      { si: [{ fact: 'OBJETO.TIPO', op: 'ES_UN', valor: 'INMUEBLE' }], ccaa: 'OBJETO.CCAA', cita: 'art. inmuebles' },
      { ccaa: 'ACTO.CCAA_COMPETENTE_ITP_AJD', cita: 'art. muebles' },
    ],
  }],
  plazos: [
    { impuesto: 'ITP_AJD', ccaa: 'ESTATAL', cantidad: 30, unidad: 'DIAS_HABILES', cita: 'estatal' },
    { impuesto: 'ITP_AJD', ccaa: 'CATALUNA', cantidad: 1, unidad: 'MESES', cita: 'catalana' },
    { impuesto: 'ITP_AJD', ccaa: 'ANDALUCIA', cantidad: 30, unidad: 'DIAS_HABILES', cita: 'andaluza vieja', vigenteDesde: '2010-01-01' },
    { impuesto: 'ITP_AJD', ccaa: 'ANDALUCIA', cantidad: 2, unidad: 'MESES', cita: 'andaluza', vigenteDesde: '2024-01-01' },
  ],
};
const esUn = (t: string, de: string) => t === de || (de === 'INMUEBLE' && ['VIVIENDA', 'LOCAL', 'INMUEBLE'].includes(t));
const finca = (tipo: string | null, ccaa?: string) => ({ objetos: [{ id: 'b', tipo, hechos: ccaa ? { CCAA: ccaa } : {} }] });

describe('plazoDeImpuesto', () => {
  it('inmueble con su comunidad: la fila de esa comunidad y la cita del tramo', () => {
    const r = plazoDeImpuesto('ITP_AJD', finca('VIVIENDA', 'CATALUNA'), TABLA, { esUn });
    expect(r.estado).toBe('RESUELTO');
    expect(r.fila?.cantidad).toBe(1);
    expect(r.conexion?.cita).toBe('art. inmuebles');
  });

  it('la fila vigente en la fecha', () => {
    expect(plazoDeImpuesto('ITP_AJD', finca('VIVIENDA', 'ANDALUCIA'), TABLA, { esUn, fecha: '2026-01-01' }).fila?.cita).toBe('andaluza');
    expect(plazoDeImpuesto('ITP_AJD', finca('VIVIENDA', 'ANDALUCIA'), TABLA, { esUn, fecha: '2015-01-01' }).fila?.cita).toBe('andaluza vieja');
  });

  it('comunidad sin fila propia → porDefecto, resuelto (no supuesto)', () => {
    const r = plazoDeImpuesto('ITP_AJD', finca('VIVIENDA', 'MADRID'), TABLA, { esUn });
    expect(r.estado).toBe('RESUELTO');
    expect(r.ccaaFila).toBe('ESTATAL');
  });

  it('equivalencias del catálogo (extranjero → la estatal)', () => {
    expect(plazoDeImpuesto('ITP_AJD', finca('VIVIENDA', 'EXTRANJERO'), TABLA, { esUn }).ccaaFila).toBe('ESTATAL');
  });

  it('sinPlazoUnico: sin plazo y con el aviso del catálogo', () => {
    const r = plazoDeImpuesto('ITP_AJD', finca('VIVIENDA', 'MIXTA'), TABLA, { esUn });
    expect(r.estado).toBe('SIN_PLAZO_UNICO');
    expect(r.fila).toBeNull();
    expect(r.aviso).toBe('varias comunidades');
  });

  it('el hecho no consta → siNoConsta con la comunidad de la notaría, marcado SUPUESTO', () => {
    const r = plazoDeImpuesto('ITP_AJD', finca('VIVIENDA'), TABLA, { esUn, ccaaNotaria: 'CATALUNA' });
    expect(r.estado).toBe('SUPUESTO');
    expect(r.fila?.cita).toBe('catalana');
    expect(r.aviso).toBe('supuesto CATALUNA');
  });

  it('sin saber si es inmueble no se salta al tramo de muebles: supuesto', () => {
    const r = plazoDeImpuesto('ITP_AJD', { acto: { CCAA_COMPETENTE_ITP_AJD: 'ANDALUCIA' }, objetos: [{ id: 'b', tipo: null, hechos: {} }] }, TABLA, { esUn, ccaaNotaria: 'CATALUNA' });
    expect(r.estado).toBe('SUPUESTO');
  });

  it('no inmueble → el segundo tramo (hecho del acto)', () => {
    const r = plazoDeImpuesto('ITP_AJD', { acto: { CCAA_COMPETENTE_ITP_AJD: 'CATALUNA' }, objetos: [{ id: 'b', tipo: 'VEHICULO', hechos: {} }] }, TABLA, { esUn });
    expect(r.estado).toBe('RESUELTO');
    expect(r.conexion?.cita).toBe('art. muebles');
  });

  it('dos fincas en comunidades distintas → VARIOS', () => {
    const caso = { objetos: [{ id: 'a', tipo: 'VIVIENDA', hechos: { CCAA: 'CATALUNA' } }, { id: 'b', tipo: 'LOCAL', hechos: { CCAA: 'MADRID' } }] };
    const r = plazoDeImpuesto('ITP_AJD', caso, TABLA, { esUn });
    expect(r.estado).toBe('VARIOS');
    expect(r.valores?.sort()).toEqual(['CATALUNA', 'MADRID']);
  });

  it('un impuesto que el catálogo no tiene → SIN_DATOS', () => {
    expect(plazoDeImpuesto('OTRO', finca('VIVIENDA', 'CATALUNA'), TABLA, { esUn }).estado).toBe('SIN_DATOS');
  });

  it('la resolución de un impuesto gana a la global', () => {
    const t: TablaPlazos = { ...TABLA, impuestos: [{ ...TABLA.impuestos[0], resolucion: { siNoConsta: { ccaa: 'ESTATAL', aviso: 'propio' } } }] };
    const r = plazoDeImpuesto('ITP_AJD', finca('VIVIENDA'), t, { esUn, ccaaNotaria: 'CATALUNA' });
    expect(r.ccaaFila).toBe('ESTATAL');
    expect(r.aviso).toBe('propio');
  });
});
