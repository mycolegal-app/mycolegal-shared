// Actos VARIANTE (26-nov-2026): 0405-4 es 0405 con la vía registral fijada (art. 28.4). Petición de Catálogo.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { escenarioPara, escenariosDelActo } from '../src/escenario';
import { mezclarReglas, escenariosDeVariante } from '../src/variante';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';
import type { FilaEscenario, ReglaGolden, RepositorioRequisitos } from '../src/puerto';

const VIA = 'ACTO.VIA_REGISTRAL_OBRA_NUEVA';
const esc = (codigo: string, via: string | null, extra: Partial<FilaEscenario> = {}): FilaEscenario => ({
  actoCodigo: '0405', codigo, nombre: codigo, porDefecto: false, objetoTipoCodigo: 'URBANO', esquemasDocFilling: [],
  estado: 'REVISADO', revisadoPor: null, condiciones: [],
  presunciones: [
    ...(via ? [{ fact: VIA, modo: 'PRESUMIR', valor: via, tema: null, situacion: null, porQue: null }] : []),
    { fact: 'SUJETO.CAPACIDAD_PLENA', modo: 'PRESUMIR', valor: true, tema: null, situacion: null, porQue: null },
  ],
  ...extra,
});
const ESCENARIOS = [
  esc('NUEVA_TERMINADA', 'LICENCIA_28_1', { porDefecto: true }),
  esc('AMPLIACION_VERTICAL', 'LICENCIA_28_1'),
  esc('AMPLIACION_VERTICAL_28_4', 'PRESCRIPCION_28_4', { presunciones: [{ fact: VIA, modo: 'PRESUMIR', valor: 'PRESCRIPCION_28_4', tema: null, situacion: null, porQue: null }] }),
  esc('NUEVA_TERMINADA_28_4', 'PRESCRIPCION_28_4'),
  esc('RECTIFICACION', 'PRESCRIPCION_28_4'),
];

// Reglas de 0405: la nota simple siempre; la CCDG sólo por la vía 28.4; la licencia sólo por la 28.1.
const viaEs = (v: string) => [cond('ACTO', 'VIA_REGISTRAL_OBRA_NUEVA', 'EQ', v, { tipoDato: 'ENUM' })];
const R0405: ReglaGolden[] = [
  regla({ codigo: '0405-R01', documentoCodigo: 'REQ_NOTA_SIMPLE', actoCodigo: '0405' }),
  regla({ codigo: '0405-R02', documentoCodigo: 'REQ_CCDG', actoCodigo: '0405', condiciones: viaEs('PRESCRIPCION_28_4') }),
  regla({ codigo: '0405-R03', documentoCodigo: 'REQ_LICENCIA_OBRA', actoCodigo: '0405', condiciones: viaEs('LICENCIA_28_1') }),
];
// Las propias de la variante: una repite un documento del base (gana el base) y otra es suya.
const R04054: ReglaGolden[] = [
  regla({ codigo: '0405-4-R01', documentoCodigo: 'REQ_NOTA_SIMPLE', actoCodigo: '0405-4' }),
  regla({ codigo: '0405-4-R05', documentoCodigo: 'REQ_VALOR_FISCAL_OBRA', actoCodigo: '0405-4' }),
];

const repoVariante = (conVariante = true): RepositorioRequisitos => ({
  ...repo({ tiposObjeto: [...TIPOS_OBJETO, { codigo: 'VIVIENDA_UNIFAMILIAR', parentCodigo: 'VIVIENDA' }], conGolden: ['0405', '0405-4'] }),
  async reglasDeActo({ actoCodigo }) { return actoCodigo === '0405' ? R0405 : actoCodigo === '0405-4' ? R04054 : []; },
  async escenariosDeActo(acto) { return acto === '0405' ? ESCENARIOS : []; },
  ...(conVariante
    ? { async varianteDe(acto: string) { return acto === '0405-4' ? { base: '0405', hechosFijos: { [VIA]: 'PRESCRIPCION_28_4' } } : null; } }
    : {}),
});

describe('actos variante (varianteDe + hechosFijos)', () => {
  it('reglas del base con la vía fijada, más las propias; con el mismo documento gana el base', async () => {
    const r = await resolverRequisitos(repoVariante(), '0405-4', {});
    const firmes = r.firmes.map((x) => x.codigo).sort();
    expect(firmes).toEqual(['0405-4-R05', '0405-R01', '0405-R02']);
    // La vía es un hecho conocido: no se pregunta, y la licencia (28.1) queda descartada.
    expect(r.preguntas.map((p) => p.fact)).not.toContain(VIA);
    expect(r.firmes.map((x) => x.codigo)).not.toContain('0405-R03');
  });

  it('el hecho fijo pisa una presunción contraria y lo que diga el expediente', async () => {
    const r = await resolverRequisitos(repoVariante(), '0405-4', { acto: { VIA_REGISTRAL_OBRA_NUEVA: 'LICENCIA_28_1' } }, { presunciones: { [VIA]: 'LICENCIA_28_1' } });
    expect(r.firmes.map((x) => x.codigo)).toContain('0405-R02');
    expect(r.firmes.map((x) => x.codigo)).not.toContain('0405-R03');
  });

  it('casos: los del base compatibles; por defecto, el gemelo del por defecto del base', async () => {
    const lista = await escenariosDelActo(repoVariante(), '0405-4');
    expect(lista.map((e) => e.codigo)).toEqual(['NUEVA_TERMINADA_28_4', 'AMPLIACION_VERTICAL_28_4', 'RECTIFICACION']);
    expect(lista[0].porDefecto).toBe(true);
  });

  it('aceptación: escenarioPara(0405-4, vivienda unifamiliar) → NUEVA_TERMINADA_28_4', async () => {
    const e = await escenarioPara(repoVariante(), '0405-4', { tipoObjeto: 'VIVIENDA_UNIFAMILIAR' });
    expect(e?.codigo).toBe('NUEVA_TERMINADA_28_4');
  });

  it('con 0 reglas propias en el universal, la variante usa la capa del base: no lee sus heredadas (MIG:)', async () => {
    const pedidas: { acto: string; soloGolden: boolean }[] = [];
    const base = repoVariante();
    const r = await resolverRequisitos({
      ...base,
      async actosConGolden(codigos: string[]) { return new Set(codigos.filter((c) => c === '0405')); },
      async reglasDeActo(a: { actoCodigo: string; soloGolden: boolean }) {
        pedidas.push({ acto: a.actoCodigo, soloGolden: a.soloGolden });
        return a.actoCodigo === '0405' ? R0405 : [];
      },
    } as RepositorioRequisitos, '0405-4', {});
    expect(pedidas).toEqual([{ acto: '0405', soloGolden: true }, { acto: '0405-4', soloGolden: true }]);
    expect(r.firmes.map((x) => x.codigo)).toContain("0405-R01");
  });

  it('sin `varianteDe` en el repositorio, todo como antes', async () => {
    const r = await resolverRequisitos(repoVariante(false), '0405-4', {});
    expect(r.firmes.map((x) => x.codigo).sort()).toEqual(['0405-4-R01', '0405-4-R05']);
    expect(await escenarioPara(repoVariante(false), '0405-4')).toBeNull();
  });

  it('mezclarReglas descarta las transversales de la variante (ya vienen con el base)', () => {
    const t = regla({ codigo: 'GLOBAL-R01', documentoCodigo: 'REQ_DNI', ambito: 'TODOS' });
    expect(mezclarReglas([], [t]).length).toBe(0);
  });

  it('si el por defecto del base es compatible, sigue siéndolo', () => {
    const casos = escenariosDeVariante(
      [{ ...ESCENARIOS.map((f) => ({ codigo: f.codigo }))[0], actoCodigo: '0405', nombre: 'X', porDefecto: true, objetoTipo: null, esquemasDocFilling: [], estado: 'X', revisadoPor: null, condiciones: [], presunciones: [], preguntarSiempre: [] }],
      { [VIA]: 'PRESCRIPCION_28_4' },
    );
    expect(casos[0].porDefecto).toBe(true);
  });
});
