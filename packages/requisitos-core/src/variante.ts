// ACTOS VARIANTE (26-nov-2026, petición de Catálogo aprobada por Carles; sólo LOCAL de momento).
//
// Un acto «-n» (0405-4: obra nueva por prescripción, art. 28.4) es su acto base (0405) con unos hechos ya fijados
// (ACTO.VIA_REGISTRAL_OBRA_NUEVA = PRESCRIPCION_28_4). Lo declara el catálogo con dos columnas de `legal_acts_global`:
// `varianteDe` (el código del base) y `hechosFijos` ({ fact: valor }). Sin códigos en el motor: todo sale de ahí.
//
//   - Reglas: las del base (con sus transversales) más las PROPIAS de la variante; si las dos piden el mismo documento,
//     gana la del base.
//   - Hechos fijos: hechos CONOCIDOS (no presunciones): pisan cualquier presunción y no se preguntan.
//   - Escenarios: los del base compatibles con los hechos fijos (fuera el que presume otro valor). Por defecto, el del
//     base si es compatible; si no, el compatible que más presunciones comparte con él (NUEVA_TERMINADA → su gemelo
//     NUEVA_TERMINADA_28_4).
import type { Hechos } from './motor';
import type { Escenario } from './escenario';
import type { ReglaGolden, RepositorioRequisitos } from './puerto';

export interface Variante {
  base: string;
  /** `{ 'ACTO.VIA_REGISTRAL_OBRA_NUEVA': 'PRESCRIPCION_28_4' }` (fact completo → valor). */
  hechosFijos: Record<string, unknown>;
}

/** La variante de un acto, o null (acto normal, o repositorio anterior a esta versión). */
export async function varianteDe(repo: RepositorioRequisitos, actoCodigo: string): Promise<Variante | null> {
  if (!repo.varianteDe) return null;
  const v = await repo.varianteDe(actoCodigo);
  return v && v.base && v.base !== actoCodigo ? { base: v.base, hechosFijos: v.hechosFijos ?? {} } : null;
}

/** Los hechos del expediente con los fijos de la variante encima (ACTO a nivel de acto; SUJETO/OBJETO, en todos). Pura. */
export function conHechosFijos(hechos: Hechos, fijos: Record<string, unknown>): Hechos {
  const out: Hechos = {
    acto: { ...(hechos.acto ?? {}) },
    sujetos: (hechos.sujetos ?? []).map((s) => ({ ...s, hechos: { ...s.hechos } })),
    objetos: (hechos.objetos ?? []).map((o) => ({ ...o, hechos: { ...o.hechos } })),
  };
  for (const [fact, valor] of Object.entries(fijos)) {
    const [ambito, ...resto] = fact.split('.');
    const nombre = resto.join('.');
    if (!nombre) continue;
    if (ambito === 'ACTO') out.acto![nombre] = valor;
    else if (ambito === 'SUJETO') for (const s of out.sujetos!) s.hechos[nombre] = valor;
    else if (ambito === 'OBJETO') for (const o of out.objetos!) o.hechos[nombre] = valor;
  }
  return out;
}

/** Las presunciones sin las de los hechos fijos (éstos son conocidos y mandan). Pura. */
export function sinFijos(presunciones: Record<string, unknown>, fijos: Record<string, unknown>): Record<string, unknown> {
  const out = { ...presunciones };
  for (const f of Object.keys(fijos)) delete out[f];
  return out;
}

/** Qué pide una regla, para saber si dos reglas piden lo mismo. */
const documentoDe = (r: Pick<ReglaGolden, 'documentoCodigo' | 'evidenciaGrupoCodigo'>) => r.documentoCodigo ?? `GE:${r.evidenciaGrupoCodigo ?? ''}`;

/** Reglas del base + las propias (de ACTO) de la variante; con el mismo documento, gana la del base. Pura. */
export function mezclarReglas<T extends Pick<ReglaGolden, 'documentoCodigo' | 'evidenciaGrupoCodigo' | 'ambito'>>(base: T[], propias: T[]): T[] {
  const pedidos = new Set(base.map(documentoDe));
  return [...base, ...propias.filter((r) => r.ambito === 'ACTO' && !pedidos.has(documentoDe(r)))];
}

const iguales = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Los escenarios del base compatibles con los hechos fijos, con el por defecto recolocado. Pura. */
export function escenariosDeVariante(base: Escenario[], fijos: Record<string, unknown>): Escenario[] {
  const compatible = (e: Escenario) => e.presunciones.every((p) => !(p.fact in fijos) || iguales(p.valor, fijos[p.fact]));
  const vale = base.filter(compatible);
  if (!vale.length) return [];
  const defBase = base.find((e) => e.porDefecto);
  let def = vale.find((e) => e.porDefecto) ?? null;
  if (!def && defBase) {
    // El «gemelo» del por defecto: el que más presunciones comparte con él (fuera de los hechos fijos), del mismo tipo.
    const comunes = (e: Escenario) => e.presunciones.filter((p) => !(p.fact in fijos)
      && defBase.presunciones.some((q) => q.fact === p.fact && iguales(q.valor, p.valor))).length;
    def = [...vale].sort((a, b) =>
      Number(b.objetoTipo === defBase.objetoTipo) - Number(a.objetoTipo === defBase.objetoTipo) || comunes(b) - comunes(a))[0];
  }
  def = def ?? vale[0];
  const lista = vale.map((e) => ({ ...e, porDefecto: e === def }));
  return [lista.find((e) => e.porDefecto)!, ...lista.filter((e) => !e.porDefecto)];
}
