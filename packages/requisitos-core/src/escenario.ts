// ESCENARIOS BASE: qué se da por cierto en un acto, y cuál toca.
//
// Subido desde Consultor (`src/lib/requisitos/escenario.ts`) el 9-oct-2026. Hasta entonces el
// motor sólo sabía APLICAR presunciones que le pasaran; elegir el escenario y heredar las
// presunciones transversales existía sólo en Consultor, así que el Redactor llamaba al motor sin
// ninguna: en una compraventa preguntaba 71 cosas en vez de 6 —el arrendatario agricultor, la
// dotación fundacional, la forma de comparecer…—, y además se perdían las 301 presunciones que el
// 8-oct se quitaron de los escenarios de los actos porque ya se heredan de las transversales.
//
// DÓNDE SE DEFINEN (catálogo universal, Drive):
//   · los escenarios de cada acto, en §11 de `src/NNNN.md` (tabla `acto_escenario_base` con sus
//     `acto_presuncion`): un caso por tipo de bien —vivienda en PH, garaje, rústica…— o uno `BASE`;
//   · las presunciones transversales, en el bloque `presunciones:` de `GLOBAL.md`, de la familia
//     (`F05.md`) y de la subfamilia (`05A.md`) (tabla `presuncion_transversal_global`).
//
// Precedencia, de menos a más específica:
//
//     GLOBAL < familia < subfamilia < escenario del acto < notaría
//
// y dentro de un nivel la autonómica gana a la estatal (sólo si se conoce la comunidad). Una
// presunción acotada a un tipo de bien vale si el bien es de ese tipo o de un hijo, o si no se
// sabe qué bien es. Un acto sin escenario propio recibe un «Caso general» con lo heredado.
//
// Cuatro caminos eligen el escenario, y dan el mismo resultado en todas las apps:
//
//   1. caso elegido por código (el modal de Consultor)            → ese
//   2. esquema DocFilling (el Redactor sabe qué plantilla usa)    → el caso que lo lista
//   3. tipo del objeto conocido (Notaría, el Revisor)             → el ancestro-o-igual más cercano
//   4. nada                                                        → el por defecto
//
// Lo que sale son PRESUNCIONES: el motor las aplica sólo a lo que no se sabe y un dato del
// expediente las pisa siempre.
import { FACT_TIPO_OBJETO } from './motor';
import type { RepositorioRequisitos, FilaEscenario, FilaTransversal, AjustePresuncion, NodoTipo } from './puerto';

export interface Presuncion {
  fact: string;
  valor: unknown;
  tema: string | null;
  situacion: string | null;
  porQue: string | null;
  /** La ha fijado la notaría (override), no el catálogo. Lleva el id para poder deshacerla. */
  ajuste?: { id: string; motivo: string | null; escenarioCodigo: string } | null;
  /** De qué capa viene una heredada: `GLOBAL`, `F05`, `05A`. Ausente si es del escenario del acto. */
  origen?: string | null;
}

export interface Escenario {
  actoCodigo: string;
  codigo: string;
  nombre: string;
  porDefecto: boolean;
  objetoTipo: string | null;
  esquemasDocFilling: string[];
  estado: string;
  revisadoPor: string | null;
  condiciones: { texto: string; temas: string[] }[];
  presunciones: Presuncion[];
  preguntarSiempre: { fact: string; porQue: string | null }[];
}

export type ComoSeEligio = 'ELEGIDO' | 'POR_ESQUEMA' | 'POR_TIPO' | 'POR_DEFECTO';

export interface EscenarioResuelto extends Escenario {
  como: ComoSeEligio;
  /** Los demás casos del acto, para poder cambiar de caso desde la pantalla. */
  casos: { codigo: string; nombre: string; objetoTipo: string | null; porDefecto: boolean }[];
  /** Cuántas presunciones ha cambiado la notaría en este caso. */
  ajustes: number;
}

export interface OpcionesEscenario {
  /** Caso elegido por su código. */
  codigo?: string | null;
  /** Esquema maestro DocFilling que se está usando (clave del esquema). */
  esquema?: string | null;
  /** Tipo del objeto, si se conoce. */
  tipoObjeto?: string | null;
  /** Comunidad autónoma (código), para las presunciones autonómicas. */
  ccaaCodigo?: string | null;
  /** Organización, para aplicar sus ajustes (`acto_presuncion_override`). */
  orgId?: string | null;
}

const NIVEL: Record<string, number> = { TODOS: 0, FAMILIA: 1, SUBFAMILIA: 2 };

/** Presunciones planas para el motor: sólo lo que se PRESUME, con el tipo de bien del caso. */
export function presuncionesDe(e: Pick<Escenario, 'presunciones' | 'objetoTipo'> | null): Record<string, unknown> {
  if (!e) return {};
  const out: Record<string, unknown> = {};
  for (const p of e.presunciones) out[p.fact] = p.valor;
  if (e.objetoTipo && !(FACT_TIPO_OBJETO in out)) out[FACT_TIPO_OBJETO] = e.objetoTipo;
  return out;
}

/** Distancia es-un del tipo a un ancestro (0 = el mismo); `null` si no es ancestro. */
export function distanciaEsUn(tipo: string | null | undefined, ancestro: string, padres: Map<string, string | null>): number | null {
  let t: string | null | undefined = tipo;
  let d = 0;
  const visto = new Set<string>();
  while (t && !visto.has(t)) {
    if (t === ancestro) return d;
    visto.add(t);
    t = padres.get(t);
    d++;
  }
  return null;
}

/** Las filas del repositorio como escenarios: las PRESUMIR son presunciones; las PREGUNTAR, preguntas. */
export function escenarioDeFila(f: FilaEscenario): Escenario {
  return {
    actoCodigo: f.actoCodigo,
    codigo: f.codigo,
    nombre: f.nombre,
    porDefecto: f.porDefecto,
    objetoTipo: f.objetoTipoCodigo,
    esquemasDocFilling: f.esquemasDocFilling,
    estado: f.estado,
    revisadoPor: f.revisadoPor,
    condiciones: f.condiciones,
    presunciones: f.presunciones.filter((p) => p.modo === 'PRESUMIR')
      .map((p) => ({ fact: p.fact, valor: p.valor, tema: p.tema, situacion: p.situacion, porQue: p.porQue })),
    preguntarSiempre: f.presunciones.filter((p) => p.modo === 'PREGUNTAR').map((p) => ({ fact: p.fact, porQue: p.porQue })),
  };
}

/** El caso general de un acto sin escenario propio, para colgarle lo heredado. */
export function casoGeneral(actoCodigo: string): Escenario {
  return {
    actoCodigo, codigo: 'BASE', nombre: 'Caso general', porDefecto: true, objetoTipo: null, esquemasDocFilling: [],
    estado: 'BORRADOR', revisadoPor: null, condiciones: [], presunciones: [], preguntarSiempre: [],
  };
}

/**
 * Pone debajo del escenario lo que hereda de sus transversales. Pura. El escenario manda sobre lo
 * heredado; lo que el escenario pregunta siempre no se presume.
 */
export function componerTransversales(
  e: Escenario,
  filas: FilaTransversal[],
  opciones: { ccaaCodigo?: string | null; tipoObjeto?: string | null },
  padres: Map<string, string | null>,
): Escenario {
  const tipo = opciones.tipoObjeto ?? e.objetoTipo;
  const aplicables = filas
    .filter((f) => !f.ccaaCodigo || (opciones.ccaaCodigo && f.ccaaCodigo === opciones.ccaaCodigo))
    .filter((f) => !f.objetoTipoCodigo || !tipo || distanciaEsUn(tipo, f.objetoTipoCodigo, padres) !== null)
    // De menos a más específica: la última escritura de un hecho es la que gana.
    .sort((a, b) => (NIVEL[a.ambito] ?? 0) - (NIVEL[b.ambito] ?? 0) || Number(!!a.ccaaCodigo) - Number(!!b.ccaaCodigo));
  const heredadas = new Map<string, FilaTransversal>();
  for (const f of aplicables) heredadas.set(f.fact, f);
  const delEscenario = new Set([...e.presunciones.map((p) => p.fact), ...e.preguntarSiempre.map((q) => q.fact)]);
  const presunciones: Presuncion[] = [];
  const preguntarSiempre = [...e.preguntarSiempre];
  for (const f of heredadas.values()) {
    if (delEscenario.has(f.fact)) continue;
    if (f.modo === 'PREGUNTAR') preguntarSiempre.push({ fact: f.fact, porQue: f.porQue });
    else presunciones.push({ fact: f.fact, valor: f.valor, tema: f.tema, situacion: f.situacion, porQue: f.porQue, origen: f.fichero });
  }
  return { ...e, presunciones: [...presunciones, ...e.presunciones], preguntarSiempre };
}

/**
 * Aplica lo que la notaría presume o pregunta siempre (`acto_presuncion_override`): las del caso
 * concreto mandan sobre las de `*`. Pura.
 */
export function aplicarAjustes(e: Escenario, ajustes: AjustePresuncion[]): { escenario: Escenario; n: number } {
  const aplicables = ajustes.filter((a) => a.escenarioCodigo === '*' || a.escenarioCodigo === e.codigo);
  if (aplicables.length === 0) return { escenario: e, n: 0 };
  const porFact = new Map<string, AjustePresuncion>();
  for (const a of aplicables) {
    const previo = porFact.get(a.fact);
    if (!previo || (previo.escenarioCodigo === '*' && a.escenarioCodigo !== '*')) porFact.set(a.fact, a);
  }
  const presunciones: Presuncion[] = [];
  const preguntar = [...e.preguntarSiempre];
  const vistos = new Set<string>();
  for (const p of e.presunciones) {
    const a = porFact.get(p.fact);
    vistos.add(p.fact);
    if (!a) { presunciones.push(p); continue; }
    if (a.modo === 'PREGUNTAR') { preguntar.push({ fact: p.fact, porQue: a.motivo ?? 'La notaría lo pregunta siempre.' }); continue; }
    presunciones.push({ ...p, valor: a.valor, ajuste: { id: a.id, motivo: a.motivo, escenarioCodigo: a.escenarioCodigo } });
  }
  for (const a of porFact.values()) {
    if (vistos.has(a.fact)) continue;
    const idx = preguntar.findIndex((q) => q.fact === a.fact);
    if (a.modo === 'PRESUMIR') {
      if (idx >= 0) preguntar.splice(idx, 1);
      presunciones.push({ fact: a.fact, valor: a.valor, tema: null, situacion: null, porQue: a.motivo, ajuste: { id: a.id, motivo: a.motivo, escenarioCodigo: a.escenarioCodigo } });
    } else if (idx < 0) {
      preguntar.push({ fact: a.fact, porQue: a.motivo ?? 'La notaría lo pregunta siempre.' });
    }
  }
  return { escenario: { ...e, presunciones, preguntarSiempre: preguntar }, n: porFact.size };
}

/** Elige el escenario de una lista. Pura. Ver los cuatro caminos en la cabecera. */
export function elegirEscenario(
  lista: Escenario[],
  opciones: Pick<OpcionesEscenario, 'codigo' | 'esquema' | 'tipoObjeto'>,
  padres: Map<string, string | null>,
): { escenario: Escenario; como: ComoSeEligio } | null {
  if (lista.length === 0) return null;
  if (opciones.codigo) {
    const e = lista.find((x) => x.codigo === opciones.codigo);
    if (e) return { escenario: e, como: 'ELEGIDO' };
  }
  if (opciones.esquema) {
    const e = lista.find((x) => x.esquemasDocFilling.includes(opciones.esquema!));
    if (e) return { escenario: e, como: 'POR_ESQUEMA' };
  }
  if (opciones.tipoObjeto) {
    // El caso cuyo tipo de bien es el ancestro-o-igual más cercano; entre empates, el por defecto.
    let mejor: { e: Escenario; d: number } | null = null;
    for (const e of lista) {
      if (!e.objetoTipo) continue;
      const d = distanciaEsUn(opciones.tipoObjeto, e.objetoTipo, padres);
      if (d === null) continue;
      if (!mejor || d < mejor.d || (d === mejor.d && e.porDefecto && !mejor.e.porDefecto)) mejor = { e, d };
    }
    if (mejor) return { escenario: mejor.e, como: 'POR_TIPO' };
  }
  const def = lista.find((x) => x.porDefecto) ?? lista[0];
  return { escenario: def, como: 'POR_DEFECTO' };
}

const padresDe = (nodos: NodoTipo[]) => new Map(nodos.map((n) => [n.codigo, n.parentCodigo]));

async function leer(repo: RepositorioRequisitos, actoCodigo: string) {
  // Opcionales en el puerto: un repositorio anterior a 0.3.3 no los tiene y el acto va sin
  // escenario, que es lo que pasaba hasta ahora.
  const [propios, filas] = await Promise.all([
    repo.escenariosDeActo ? repo.escenariosDeActo(actoCodigo) : Promise.resolve([] as FilaEscenario[]),
    repo.presuncionesTransversales ? repo.presuncionesTransversales(actoCodigo) : Promise.resolve([] as FilaTransversal[]),
  ]);
  return { propios: propios.map(escenarioDeFila), filas };
}

/**
 * Los casos de un acto, el por defecto primero, cada uno con lo que hereda. Si el acto no tiene
 * escenarios pero hereda presunciones, un único «Caso general». Vacío si no hay nada que presumir.
 */
export async function escenariosDelActo(
  repo: RepositorioRequisitos,
  actoCodigo: string,
  opciones: { ccaaCodigo?: string | null } = {},
): Promise<Escenario[]> {
  const { propios, filas } = await leer(repo, actoCodigo);
  if (filas.length === 0) return propios;
  const padres = filas.some((f) => f.objetoTipoCodigo) ? padresDe(await repo.tiposDeObjeto()) : new Map<string, string | null>();
  const lista = propios.length ? propios : [casoGeneral(actoCodigo)];
  return lista.map((e) => componerTransversales(e, filas, { ccaaCodigo: opciones.ccaaCodigo }, padres));
}

/**
 * El escenario que toca para un acto, ya compuesto (transversales y, con `orgId`, los ajustes de
 * la notaría), con los demás casos a mano. `null` si el acto no tiene nada que presumir: entonces
 * el motor va sin presunciones, que es lo honesto.
 *
 * ```ts
 * const e = await escenarioPara(repo, '0501', { esquema: '0501_ESQUEMA_MAESTRO_VIVIENDA_PH', ccaaCodigo: '09' });
 * const r = await resolverRequisitos(repo, '0501', hechos, { presunciones: presuncionesDe(e), ccaaCodigo: '09' });
 * ```
 */
export async function escenarioPara(
  repo: RepositorioRequisitos,
  actoCodigo: string,
  opciones: OpcionesEscenario = {},
): Promise<EscenarioResuelto | null> {
  const { propios, filas } = await leer(repo, actoCodigo);
  const lista = propios.length ? propios : filas.length ? [casoGeneral(actoCodigo)] : [];
  if (lista.length === 0) return null;
  const padres = opciones.tipoObjeto || filas.some((f) => f.objetoTipoCodigo)
    ? padresDe(await repo.tiposDeObjeto()) : new Map<string, string | null>();
  const elegido = elegirEscenario(lista, opciones, padres);
  if (!elegido) return null;
  const compuesto = filas.length
    ? componerTransversales(elegido.escenario, filas, { ccaaCodigo: opciones.ccaaCodigo, tipoObjeto: opciones.tipoObjeto }, padres)
    : elegido.escenario;
  const ajustes = opciones.orgId && repo.ajustesDePresuncion ? await repo.ajustesDePresuncion(opciones.orgId, actoCodigo) : [];
  const { escenario, n } = aplicarAjustes(compuesto, ajustes);
  return {
    ...escenario,
    como: elegido.como,
    casos: lista.map((e) => ({ codigo: e.codigo, nombre: e.nombre, objetoTipo: e.objetoTipo, porDefecto: e.porDefecto })),
    ajustes: n,
  };
}
