// Listas deducidas del uso en la plantilla (5-oct-2026).
import { describe, it, expect } from 'vitest';
import { esquemaDeCampos } from '../index';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';

const esquema = async (t: string, p: Record<string, string> = {}) =>
  esquemaDeCampos((await expandirIncludes(t, repositorioDeMapa(p))).texto, {});

describe('listas deducidas', () => {
  it('una lista sin declarar aparece, con los ITEM.X que usa', async () => {
    const e = await esquema('{{FOR EACH ITEM IN FINCAS}}{{ITEM.TOMO}} {{IF ITEM.CRU}}{{ITEM.CRU}}{{ENDIF}}{{ENDFOR}}');
    const l = e.campos.find((c) => c.nombre === 'FINCAS');
    expect(l?.esArray).toBe(true);
    expect(l?.subcampos.map((s) => s.nombre).sort()).toEqual(['CRU', 'TOMO']);
    expect(e.campos.some((c) => c.nombre.startsWith('ITEM.'))).toBe(false);
  });

  it('los campos de un párrafo vinculado son subcampos, no campos sueltos', async () => {
    const e = await esquema('{{FOR EACH ITEM IN L}}{{INCLUDE B(ITEM)}}{{ENDFOR}}{{OTRO}}', { B: '{{CP_NIF}} {{CP_NOMBRE}}' });
    expect(e.campos.find((c) => c.nombre === 'L')?.subcampos.map((s) => s.nombre).sort()).toEqual(['CP_NIF', 'CP_NOMBRE']);
    expect(e.campos.map((c) => c.nombre).sort()).toEqual(['L', 'OTRO']);
  });

  it('un nombre usado también fuera del elemento sigue siendo campo suelto', async () => {
    const e = await esquema('{{FOR EACH ITEM IN L}}{{INCLUDE B(ITEM)}}{{ENDFOR}} {{CP_NIF}}', { B: '{{CP_NIF}}' });
    expect(e.campos.some((c) => c.nombre === 'CP_NIF' && !c.esArray)).toBe(true);
  });

  it('conserva lo declarado y añade lo que falta', async () => {
    const e = await esquema('{{DECLARE ARRAY G(NUM:[número de plaza])}}{{FOR EACH ITEM IN G}}{{ITEM.NUM}} {{ITEM.FINCA}}{{ENDFOR}}');
    const g = e.campos.find((c) => c.nombre === 'G');
    expect(g?.subcampos).toEqual([
      { nombre: 'NUM', tipo: 'TEXT', instruccion: 'número de plaza', iuiPath: null, req: [], doc: [] },
      { nombre: 'FINCA', tipo: 'TEXT', instruccion: null, iuiPath: null, req: [], doc: [] },
    ]);
  });

  it('una sublista es un subcampo LIST del padre', async () => {
    const e = await esquema('{{FOR EACH ITEM IN E}}{{ITEM.N}}{{FOR EACH A IN ITEM.ANEJOS}}{{A.TIPO}}{{ENDFOR}}{{ENDFOR}}');
    const s = e.campos.find((c) => c.nombre === 'E')?.subcampos.find((x) => x.nombre === 'ANEJOS');
    expect(s?.tipo).toBe('LIST');
    expect(s?.instruccion).toBe('Lista de: TIPO');
  });
});

import { listasDeLaPlantilla } from '../index';
describe('subcampos que gobiernan condiciones', () => {
  it('se distinguen de los datos', async () => {
    const t = (await expandirIncludes('{{FOR EACH ITEM IN L}}{{IF ITEM.TIPO=="PF"}}{{ITEM.NOMBRE}}{{ENDIF}}{{INCLUDE B(ITEM)}}{{ENDFOR}}',
      repositorioDeMapa({ B: '{{IF CASADO}}{{CONYUGE}}{{ENDIF}}' }))).texto;
    const l = listasDeLaPlantilla(t).listas.get('L')!;
    expect([...l.condiciones].sort()).toEqual(['CASADO', 'TIPO']);
    expect([...l.subcampos.keys()].sort()).toEqual(['CASADO', 'CONYUGE', 'NOMBRE', 'TIPO']);
  });
});

import { marcarListasParaSonda, composeWithDiagnostics } from '../index';
describe('marcarListasParaSonda', () => {
  it('testigo de bucle y de condición alcanzada, sólo en las ramas que se toman', async () => {
    const t = (await expandirIncludes('{{FOR EACH ITEM IN L}}{{IF ITEM.TIPO=="PF"}}{{INCLUDE PF(ITEM)}}{{ELSE}}{{INCLUDE PJ(ITEM)}}{{ENDIF}}{{ENDFOR}}',
      repositorioDeMapa({ PF: '{{IF CASADO}}c{{ENDIF}}', PJ: '{{IF ES_SA}}sa{{ENDIF}}' }))).texto;
    const sondado = (composeWithDiagnostics(marcarListasParaSonda(t), { L: [{ TIPO: 'PJ' }] } as never) as { text: string }).text;
    expect(sondado).toContain('«L:L»');
    expect(sondado).toContain('«C:L:TIPO»');
    expect(sondado).toContain('«C:L:ES_SA»');
    expect(sondado).not.toContain('CASADO');
  });
});

describe('valores con que se compara un subcampo', () => {
  it('== e IN, por ITEM.X y dentro de un vinculado', async () => {
    const t = (await expandirIncludes('{{FOR EACH ITEM IN L}}{{IF ITEM.TIPO=="Persona Física"}}a{{ENDIF}}{{IF ITEM.TIPO IN ("Persona Jurídica","UTE")}}b{{ENDIF}}{{INCLUDE B(ITEM)}}{{ENDFOR}}',
      repositorioDeMapa({ B: '{{IF INTERVIENE_EN=="Propio Nombre"}}c{{ENDIF}}' }))).texto;
    const l = listasDeLaPlantilla(t).listas.get('L')!;
    expect([...l.valores.get('TIPO')!].sort()).toEqual(['Persona Física', 'Persona Jurídica', 'UTE']);
    expect([...l.valores.get('INTERVIENE_EN')!]).toEqual(['Propio Nombre']);
  });
});
