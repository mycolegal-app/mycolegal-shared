/**
 * F4 de `PLAN_TECNICO_REQUISITOS_DOCUMENTALES_V03.md` — motor de evaluación de requisitos
 * documentales.
 *
 * QUÉ RESUELVE. Dado un acto, una jurisdicción y los hechos que se conocen del expediente,
 * decide qué documentos hacen falta. Lo que NO hace es decidir por conocimiento propio: solo
 * evalúa las reglas curadas. Esa separación es del modelo (§11) y es lo que permite explicar
 * cada requisito con su fundamento.
 *
 * LÓGICA TERNARIA, Y ES EL PUNTO ENTERO. Un hecho que no se conoce NO es falso:
 *
 *     AND(TRUE, UNKNOWN)  = UNKNOWN        OR(FALSE, UNKNOWN) = UNKNOWN
 *     AND(FALSE, UNKNOWN) = FALSE          OR(TRUE, UNKNOWN)  = TRUE
 *
 * Tratar lo desconocido como falso escondería requisitos que quizá aplican, que es
 * exactamente el fallo que este trabajo existe para evitar. Cuando una regla sale UNKNOWN no
 * se descarta: se devuelve como **pendiente**, con los hechos que faltan, y esos hechos son
 * las preguntas que se le hacen al operador.
 *
 * Salida en tres bloques, que es el contrato acordado para el expediente:
 *
 *   · firmes       — aplican pase lo que pase; van a la lista inicial
 *   · condicionados— dependen de algo que no se sabe; se revelan al contestar
 *   · preguntas    — el hecho que bloquea, con su enunciado, tipo y opciones
 */
import { decidirCapa, type Capa } from './capa';
import type { RepositorioRequisitos } from './puerto';

/** TRUE / FALSE / UNKNOWN. `null` es UNKNOWN: no se conoce, que no es lo mismo que falso. */
export type Ternario = true | false | null;

export interface Hechos {
  /** Hechos de ámbito ACTO: `{ VIA_REGISTRAL_OBRA_NUEVA: 'LICENCIA_28_1' }`. */
  acto?: Record<string, unknown>;
  /** Por sujeto del expediente, con su rol: permite acotar «casado, pero el VENDEDOR». */
  sujetos?: { id: string; rol?: string | null; tipo?: string | null; hechos: Record<string, unknown> }[];
  objetos?: { id: string; tipo?: string | null; hechos: Record<string, unknown> }[];
}

export interface Pregunta {
  fact: string;
  label: string;
  tipoDato: string;
  opciones: unknown;
  fuentePreferente: string | null;
  /** Qué requisitos desbloquea contestarla. Ordenar por esto pone primero lo que más rinde. */
  bloquea: string[];
}

export interface RequisitoResuelto {
  /** Id de la fila del catálogo global. Lo necesita quien aplique encima la capa por-org,
   *  que engancha sus overrides por `globalId`. */
  id: string;
  codigo: string;
  descripcion: string | null;
  tipo: 'OBLIGATORIO' | 'RECOMENDADO';
  momento: string;
  scopeGeneracion: string;
  ccaaCodigo: string;
  /** Documento concreto, o el grupo con sus alternativas. */
  documentoCodigo: string | null;
  evidenciaGrupo: { codigo: string; minRequerido: number; documentos: string[] } | null;
  responsable: string | null;
  metodo: string | null;
  comoObtener: string | null;
  estado: string;
  revisadoPor: string | null;
  /**
   * Qué hace el instrumento con el documento: NINGUNO (solo se recaba) o se RESEÑA,
   * INCORPORA, TESTIMONIA o PROTOCOLIZA. Lo que no es NINGUNO tiene que constar en la
   * escritura, y por eso el Revisor lo comprueba en el texto.
   */
  tratamientoInstrumento: string;
  fundamento: { norma: string | null; articulo: string | null; nota: string | null }[];
  /** Qué hechos faltan para decidir. Vacío en los firmes. */
  faltan: string[];
  /**
   * La regla está acotada a un caso —por condición o por tipo de objeto más estrecho que el
   * del acto— y no sale entera para cualquier expediente. Es lo que distingue un catálogo
   * curado de la lista heredada, que lo pedía todo siempre.
   */
  condicionada: boolean;
  /**
   * Todos los hechos que la regla mira, se conozcan o no. `faltan` es lo que bloquea HOY;
   * esto es lo que la decide siempre, y es lo que una pantalla necesita para seguir
   * enseñando el hecho después de contestarlo.
   */
  hechosQueDecide: string[];
  /**
   * Hechos que se han decidido con una PRESUNCIÓN del escenario base, no con un dato del
   * expediente. Vacío si no se pasaron presunciones o si todo lo que mira la regla se
   * sabía. La pantalla lo enseña («según el escenario base: …») porque una presunción
   * calla o impone documentos y quien lee la lista tiene que poder verlo y cambiarlo.
   */
  porPresuncion: string[];
  /** Roles a los que se pide (VENDEDOR, COMPRADOR…). Vacío = a cualquiera. */
  roles: string[];
  /** Instancias que genera: una por sujeto/objeto que haga match, según el scope. */
  instancias: { sujetoId?: string; objetoId?: string }[];
}

/** Hecho sintético: el tipo del objeto no es un atributo, pero se pregunta igual. */
export const FACT_TIPO_OBJETO = 'OBJETO.TIPO';
/** Hecho sintético gemelo para el interviniente: persona física, jurídica, sociedad de capital… */
export const FACT_TIPO_SUJETO = 'SUJETO.TIPO';

export interface Resultado {
  firmes: RequisitoResuelto[];
  condicionados: RequisitoResuelto[];
  /**
   * Lo que un hecho conocido ha DESCARTADO. Se devuelve, no se calla: quien contesta «es
   * una finca rústica» tiene que poder ver que la cédula de habitabilidad se ha ido por eso,
   * o no se fía de la lista.
   */
  descartados: RequisitoResuelto[];
  preguntas: Pregunta[];
  diagnostico: {
    reglasConsideradas: number;
    descartadasPorJurisdiccion: number;
    sustituidasPorDelta: number;
    descartadasPorCondicion: number;
    descartadasPorObjeto: number;
    descartadasPorSujeto: number;
    sinRevisionNotarial: number;
  };
}

// ── evaluación ───────────────────────────────────────────────────────────────

const y = (a: Ternario, b: Ternario): Ternario =>
  a === false || b === false ? false : a === null || b === null ? null : true;

const o = (a: Ternario, b: Ternario): Ternario =>
  a === true || b === true ? true : a === null || b === null ? null : false;

function comparar(op: string, valor: unknown, esperado: unknown): Ternario {
  if (valor === undefined) return null;
  const lista = Array.isArray(esperado) ? esperado : [esperado];
  switch (op) {
    case 'EQ': return valor === esperado;
    case 'NE': return valor !== esperado;
    case 'IN': return lista.includes(valor as never);
    case 'NOT_IN': return !lista.includes(valor as never);
    case 'GT': return Number(valor) > Number(esperado);
    case 'GTE': return Number(valor) >= Number(esperado);
    case 'LT': return Number(valor) < Number(esperado);
    case 'LTE': return Number(valor) <= Number(esperado);
    case 'EXISTS': return valor !== null && valor !== '';
    case 'NOT_EXISTS': return valor === null || valor === '';
    // IS_A necesita la jerarquía de tipos; hasta que se implemente NO se finge que se
    // sabe: devolver `false` escondería la regla y `true` la impondría. UNKNOWN la deja
    // pendiente, que es lo honesto.
    case 'IS_A': return null;
    default: return null;
  }
}

export type Cond = {
  fact: string; operador: string; valor: unknown; scopeRolCodigo: string | null; grupo: number;
};

/**
 * Evalúa las condiciones de una regla contra los hechos. Devuelve el ternario y los hechos
 * que faltaron, que son las preguntas. Exportada para que las reglas PROPIAS de una
 * notaría (override con condiciones) se evalúen exactamente igual que las del golden.
 */
export function evaluar(
  condiciones: Cond[],
  hechos: Hechos,
  ambitoDe: (fact: string) => string,
  presunciones: Record<string, unknown> = {},
): { valor: Ternario; faltan: string[]; presumidos: string[] } {
  if (condiciones.length === 0) return { valor: true, faltan: [], presumidos: [] };
  // Tercera fuente de valor, después del dato: lo que el escenario base presume. Solo
  // entra donde el dato falta, y se deja rastro de dónde entró.
  const presumidos = new Set<string>();
  const conPresuncion = (fact: string, v: unknown): unknown => {
    if (v !== undefined) return v;
    if (!(fact in presunciones)) return undefined;
    presumidos.add(fact);
    return presunciones[fact];
  };

  const porGrupo = new Map<number, Cond[]>();
  for (const c of condiciones) {
    const g = porGrupo.get(c.grupo) ?? [];
    g.push(c);
    porGrupo.set(c.grupo, g);
  }

  const faltan = new Set<string>();
  let total: Ternario = false;             // OR entre grupos: el neutro es FALSE
  for (const grupo of porGrupo.values()) {
    let acum: Ternario = true;             // AND dentro del grupo: el neutro es TRUE
    for (const c of grupo) {
      const ambito = ambitoDe(c.fact);
      const nombre = c.fact.split('.').slice(1).join('.');
      let v: Ternario;
      if (ambito === 'ACTO') {
        v = comparar(c.operador, conPresuncion(c.fact, hechos.acto?.[nombre]), c.valor);
      } else {
        // Sujetos y objetos: basta que UNO haga match. Con `scopeRolCodigo` se acota a
        // los que tienen ese rol -«casado, pero el VENDEDOR»-.
        const cands = ambito === 'SUJETO'
          ? (hechos.sujetos ?? []).filter((s) => !c.scopeRolCodigo || s.rol === c.scopeRolCodigo)
          : (hechos.objetos ?? []);
        // Sin intervinientes u objetos, la presunción hace de interviniente u objeto virtual.
        // El tipo de bien o de interviniente no es un atributo: vive en `tipo`, no en
        // `hechos`. Una condición sobre OBJETO.TIPO / SUJETO.TIPO (reglas propias de una
        // notaría) lo lee de ahí.
        const leer = (x: { tipo?: string | null; hechos: Record<string, unknown> }) => (nombre === 'TIPO' ? x.tipo ?? undefined : x.hechos[nombre]);
        if (cands.length === 0) v = comparar(c.operador, conPresuncion(c.fact, undefined), c.valor);
        else v = cands.map((x) => comparar(c.operador, conPresuncion(c.fact, leer(x)), c.valor))
          .reduce<Ternario>((a, b) => o(a, b), false);
      }
      if (v === null) faltan.add(c.fact);
      acum = y(acum, v);
    }
    total = o(total, acum);
  }
  // Si el conjunto resuelve a TRUE o FALSE, lo que faltó por el camino ya no bloquea.
  return { valor: total, faltan: total === null ? [...faltan] : [], presumidos: [...presumidos] };
}

/**
 * ¿Aplica la regla por el TIPO de objeto que declara? Misma lógica ternaria que las
 * condiciones, porque es una condición: «solo viviendas», «solo rústicas».
 *
 * El golden lo expresa con `objetos: [VIVIENDA]` en la regla, no con un hecho, y el
 * contrato (§7 paso 4) dice que esas tablas «filtran matches». Filtrar solo las instancias
 * dejaba la regla viva con cero instancias, y para quien lee la lista —el Revisor, que no
 * tiene expediente— eso era una regla FIRME: la advertencia de retracto de colindantes
 * sobre fincas rústicas salía en la venta de un piso, y la cédula de habitabilidad en la
 * de una finca rústica. Justo el defecto que el modelo v0.3 existe para no cometer.
 *
 *   sin objetos en los hechos   → no se sabe (null), salvo que el tipo declarado sea el
 *                                 del acto entero (INMUEBLE en una compraventa), que
 *                                 entonces no acota nada y la regla aplica.
 *   algún objeto hace match     → aplica.
 *   ninguno, pero el tipo del objeto es un ANCESTRO del que pide la regla
 *                               → no se sabe: «urbano» aún puede ser «vivienda».
 *   ninguno, y todos con tipo   → no aplica: se descarta.
 *   ninguno, y alguno sin tipo  → no se sabe.
 */
function aplicaPorObjeto(
  tiposRegla: string[],
  hechos: Hechos,
  esUn: (tipo: string | null | undefined, exigido: string) => boolean,
  estrecha: boolean,
  tipoPresumido?: string,
): Ternario {
  if (tiposRegla.length === 0) return true;
  // El tipo presumido rellena los objetos sin tipo, o hace de objeto virtual si no hay.
  const objs = (hechos.objetos ?? []).map((ob) => ({ ...ob, tipo: ob.tipo ?? tipoPresumido ?? null }));
  if (objs.length === 0) {
    if (tipoPresumido) return aplicaPorObjeto(tiposRegla, { objetos: [{ id: '*', tipo: tipoPresumido, hechos: {} }] }, esUn, estrecha);
    return estrecha ? null : true;
  }
  const conTipo = objs.filter((o) => o.tipo);
  if (conTipo.some((o) => tiposRegla.some((t) => esUn(o.tipo, t)))) return true;
  // Un tipo PADRE del que pide la regla —«es urbano, no sé si vivienda»— no la descarta:
  // el bien podría ser ese subtipo. Solo un tipo ajeno (rústica frente a vivienda) descarta.
  if (conTipo.some((o) => tiposRegla.some((t) => esUn(t, o.tipo as string)))) return null;
  return conTipo.length < objs.length ? null : false;
}

/**
 * Lo mismo para el TIPO DE SUJETO que declaran los roles de la regla («el VENDEDOR, si es
 * persona jurídica»). Aquí la base es implícita: una regla sin tipo vale para cualquier
 * interviniente, así que cualquier tipo declarado acota, sin necesidad de deducirlo. Sin
 * esto, la escritura de nombramiento de administrador salía en toda compraventa entre
 * particulares: el golden lo decía y nadie lo leía.
 */
function aplicaPorSujeto(
  tiposRegla: string[],
  hechos: Hechos,
  esUn: (tipo: string | null | undefined, exigido: string) => boolean,
  tipoPresumido?: string,
): Ternario {
  if (tiposRegla.length === 0) return true;
  const sujetos = (hechos.sujetos ?? []).map((su) => ({ ...su, tipo: su.tipo ?? tipoPresumido ?? null }));
  if (sujetos.length === 0) {
    if (tipoPresumido) return aplicaPorSujeto(tiposRegla, { sujetos: [{ id: '*', tipo: tipoPresumido, hechos: {} }] }, esUn);
    return null;
  }
  const conTipo = sujetos.filter((s) => s.tipo);
  if (conTipo.some((s) => tiposRegla.some((t) => esUn(s.tipo, t)))) return true;
  if (conTipo.some((s) => tiposRegla.some((t) => esUn(t, s.tipo as string)))) return null;
  return conTipo.length < sujetos.length ? null : false;
}

// ── resolución ───────────────────────────────────────────────────────────────

export interface OpcionesMotor {
  /** `''` = solo estatal. Si se pasa una CCAA, sus deltas sustituyen o complementan. */
  ccaaCodigo?: string;
  /** Estados que se sirven. Por defecto TODOS: se despliega lo no revisado con aviso. */
  estados?: string[];
  /**
   * Escenario base: valor que se da por cierto para cada hecho que el expediente no
   * conoce (`{ 'SUJETO.ES_MENOR': false, 'OBJETO.TIPO': 'VIVIENDA' }`). Nunca pisa un dato
   * conocido. Lo decidido con ellas sale en `porPresuncion` de cada regla.
   */
  presunciones?: Record<string, unknown>;
  /**
   * Capa del catálogo (`capa.ts`): `auto` (por defecto) = el golden si el acto lo tiene, si no
   * la lista básica; `basica` = siempre la lista de siempre (Lista básica de Consultor).
   */
  capa?: Capa;
}

export async function resolverRequisitos(
  repo: RepositorioRequisitos,
  actoCodigo: string,
  hechos: Hechos,
  opciones: OpcionesMotor = {},
): Promise<Resultado> {
  const ccaa = opciones.ccaaCodigo ?? '';
  const presunciones = opciones.presunciones ?? {};
  // La jerarquía is-a de los tipos de objeto y sujeto. Sin ella, una regla que pide
  // INMUEBLE no encuentra una VIVIENDA, y los requisitos MÁS BÁSICOS -la nota simple, la
  // referencia catastral- generan CERO instancias. Se ve solo al contar instancias, no al
  // contar requisitos: la regla aparece en la lista y no materializa nada.
  const [tiposObj, tiposSuj] = await Promise.all([
    repo.tiposDeObjeto(),
    repo.tiposDeSujeto(),
  ]);
  const padres = new Map<string, string | null>();
  for (const t of [...tiposObj, ...tiposSuj]) padres.set(t.codigo, t.parentCodigo);
  /** `VIVIENDA` cumple una regla que pide `URBANO`, `INMUEBLE` u `OBJETO`. */
  const esUn = (tipo: string | null | undefined, exigido: string): boolean => {
    let t: string | null | undefined = tipo;
    const visto = new Set<string>();
    while (t && !visto.has(t)) {
      if (t === exigido) return true;
      visto.add(t);
      t = padres.get(t) ?? null;
    }
    return false;
  };

  // La consulta la hace el adaptador: aquí sólo se le dice QUÉ se quiere. El
  // filtro de capa, los `include` y los `orderBy` son suyos, y es lo que permite
  // que este motor no sepa de Prisma (D30). Lo que el adaptador debe devolver
  // está descrito campo a campo en `puerto.ts` — incluidos los dos órdenes que
  // son parte del dato: `fundamentos` por `orden` y los documentos del grupo de
  // evidencia por `prioridad`.
  const reglas = await repo.reglasDeActo({
    actoCodigo,
    estados: opciones.estados ?? null,
    soloGolden: await decidirCapa(repo, actoCodigo, opciones.capa),
  });

  const diag = {
    reglasConsideradas: reglas.length,
    descartadasPorJurisdiccion: 0,
    sustituidasPorDelta: 0,
    descartadasPorCondicion: 0,
    descartadasPorObjeto: 0,
    descartadasPorSujeto: 0,
    sinRevisionNotarial: 0,
  };

  // 1. Jurisdicción: se sirve lo estatal más lo de la comunidad del expediente.
  const aplicables = reglas.filter((r) => {
    const vale = r.ccaaCodigo === '' || r.ccaaCodigo === ccaa;
    if (!vale) diag.descartadasPorJurisdiccion++;
    return vale;
  });

  // 2. Deltas: un delta de ESTA comunidad con `sustituye` desplaza a su padre. Sin este
  //    paso el expediente pediría la regla estatal y su delta, dos veces lo mismo con dos
  //    fundamentos distintos.
  const sustituidos = new Set<string>();
  for (const r of aplicables) {
    if (r.ccaaCodigo && r.ccaaCodigo === ccaa && r.modificaCodigo && r.sustituye !== false) {
      sustituidos.add(r.modificaCodigo);
    }
  }
  const vivas = aplicables.filter((r) => {
    if (sustituidos.has(r.codigo)) { diag.sustituidasPorDelta++; return false; }
    return true;
  });

  // 3. Evaluación
  const ambitoPorFact = new Map<string, string>();
  for (const r of vivas) {
    for (const c of r.condiciones) {
      ambitoPorFact.set(`${c.atributoDef.ambito}.${c.atributoDef.codigo}`, c.atributoDef.ambito);
    }
  }
  const ambitoDe = (fact: string) => fact.split('.')[0];

  // Qué tipos de objeto declara el acto en conjunto. Un tipo «estrecha» si alguna otra
  // regla del acto declara un ancestro suyo: RUSTICA estrecha en una compraventa porque
  // hay reglas para INMUEBLE; INMUEBLE no estrecha porque ninguna regla pide OBJETO. Así
  // no hace falta que el acto lleve su tipo base en la base de datos: se deduce.
  const declarados = new Set(vivas.flatMap((r) => r.objetos.map((o) => o.objetoTipoCodigo)));
  const estrecha = (t: string) => [...declarados].some((d) => d !== t && esUn(t, d));

  const firmes: RequisitoResuelto[] = [];
  const condicionados: RequisitoResuelto[] = [];
  const descartados: RequisitoResuelto[] = [];
  const preguntas = new Map<string, Pregunta>();

  for (const r of vivas) {
    const conds: Cond[] = r.condiciones.map((c) => ({
      fact: `${c.atributoDef.ambito}.${c.atributoDef.codigo}`,
      operador: c.operador, valor: c.valor, scopeRolCodigo: c.scopeRolCodigo, grupo: c.grupo,
    }));
    const porCondicion = evaluar(conds, hechos, ambitoDe, presunciones);
    const tiposRegla = r.objetos.map((o) => o.objetoTipoCodigo);
    const acotaPorObjeto = tiposRegla.length > 0 && tiposRegla.every(estrecha);
    const tipoObjPres = typeof presunciones[FACT_TIPO_OBJETO] === 'string' ? (presunciones[FACT_TIPO_OBJETO] as string) : undefined;
    const porObjeto = aplicaPorObjeto(tiposRegla, hechos, esUn, acotaPorObjeto, tipoObjPres);
    const tiposSujeto = [...new Set(r.roles.map((x) => x.sujetoTipoCodigo).filter(Boolean) as string[])];
    const tipoSujPres = typeof presunciones[FACT_TIPO_SUJETO] === 'string' ? (presunciones[FACT_TIPO_SUJETO] as string) : undefined;
    const porSujeto = aplicaPorSujeto(tiposSujeto, hechos, esUn, tipoSujPres);
    // Tipo presumido usado: hubo que acotar y ningún objeto/sujeto del expediente traía tipo.
    const presumidosTipo: string[] = [];
    if (acotaPorObjeto && tipoObjPres && !(hechos.objetos ?? []).some((ob) => ob.tipo)) presumidosTipo.push(FACT_TIPO_OBJETO);
    if (tiposSujeto.length && tipoSujPres && !(hechos.sujetos ?? []).some((su) => su.tipo)) presumidosTipo.push(FACT_TIPO_SUJETO);
    if (porCondicion.valor === false) diag.descartadasPorCondicion++;
    else if (porObjeto === false) diag.descartadasPorObjeto++;
    else if (porSujeto === false) diag.descartadasPorSujeto++;
    const valor = y(y(porCondicion.valor, porObjeto), porSujeto);
    const faltan = valor === null
      ? [...porCondicion.faltan, ...(porObjeto === null ? [FACT_TIPO_OBJETO] : []), ...(porSujeto === null ? [FACT_TIPO_SUJETO] : [])]
      : [];
    if (valor !== false && r.estado !== 'VALIDADA') diag.sinRevisionNotarial++;

    const resuelto: RequisitoResuelto = {
      id: r.id,
      codigo: r.codigo,
      descripcion: r.descripcion,
      tipo: r.tipo as 'OBLIGATORIO' | 'RECOMENDADO',
      momento: r.momento,
      scopeGeneracion: r.scopeGeneracion,
      ccaaCodigo: r.ccaaCodigo,
      documentoCodigo: r.documentoCodigo,
      evidenciaGrupo: r.evidenciaGrupo
        ? {
            codigo: r.evidenciaGrupo.codigo,
            minRequerido: r.evidenciaGrupo.minRequerido,
            documentos: r.evidenciaGrupo.documentos.map((d) => d.documentTypeCodigo),
          }
        : null,
      responsable: r.obtencion?.responsable ?? null,
      metodo: r.obtencion?.metodo ?? null,
      comoObtener: r.obtencion?.comoObtener ?? null,
      estado: r.estado,
      revisadoPor: r.revisadoPor,
      tratamientoInstrumento: r.tratamientoInstrumento,
      fundamento: r.fundamentos.map((f) => ({
        norma: f.normaBoeId, articulo: f.articulo, nota: f.nota,
      })),
      faltan,
      condicionada: conds.length > 0 || acotaPorObjeto || tiposSujeto.length > 0,
      porPresuncion: valor === null ? [] : [...new Set([...porCondicion.presumidos, ...presumidosTipo])],
      roles: [...new Set(r.roles.map((x) => x.rolCodigo).filter(Boolean) as string[])],
      hechosQueDecide: [...new Set([...conds.map((c) => c.fact), ...(acotaPorObjeto ? [FACT_TIPO_OBJETO] : []), ...(tiposSujeto.length ? [FACT_TIPO_SUJETO] : [])])],
      instancias: expandir(r.scopeGeneracion, r.roles, r.objetos, hechos, esUn),
    };

    if (valor === false) descartados.push(resuelto);
    else if (valor === true) firmes.push(resuelto);
    else {
      condicionados.push(resuelto);
      for (const c of r.condiciones) {
        const fact = `${c.atributoDef.ambito}.${c.atributoDef.codigo}`;
        if (!faltan.includes(fact)) continue;
        const p = preguntas.get(fact) ?? {
          fact,
          label: c.atributoDef.label,
          tipoDato: c.atributoDef.tipoDato,
          opciones: c.atributoDef.opciones,
          fuentePreferente: c.atributoDef.fuentePreferente,
          bloquea: [],
        };
        p.bloquea.push(r.codigo);
        preguntas.set(fact, p);
      }
      if (faltan.includes(FACT_TIPO_SUJETO)) {
        const p = preguntas.get(FACT_TIPO_SUJETO) ?? {
          fact: FACT_TIPO_SUJETO,
          label: 'Tipo de interviniente',
          tipoDato: 'ENUM',
          opciones: [] as string[],
          fuentePreferente: null,
          bloquea: [],
        };
        p.opciones = [...new Set([...(p.opciones as string[]), ...tiposSujeto])].sort();
        p.bloquea.push(r.codigo);
        preguntas.set(FACT_TIPO_SUJETO, p);
      }
      if (faltan.includes(FACT_TIPO_OBJETO)) {
        // No hay `AtributoDef` para el tipo: la pregunta se compone aquí, con las opciones
        // que de verdad distinguen algo en este acto.
        const p = preguntas.get(FACT_TIPO_OBJETO) ?? {
          fact: FACT_TIPO_OBJETO,
          label: 'Tipo de bien objeto del acto',
          tipoDato: 'ENUM',
          opciones: [] as string[],
          fuentePreferente: null,
          bloquea: [],
        };
        p.opciones = [...new Set([...(p.opciones as string[]), ...tiposRegla])].sort();
        p.bloquea.push(r.codigo);
        preguntas.set(FACT_TIPO_OBJETO, p);
      }
    }
  }

  // Las preguntas que más requisitos desbloquean, primero: contestar una que destraba
  // ocho rinde más que contestar ocho que destraban una.
  const orden = [...preguntas.values()].sort((a, b) => b.bloquea.length - a.bloquea.length);
  return { firmes, condicionados, descartados, preguntas: orden, diagnostico: diag };
}

/**
 * Cuántas instancias materiales genera la regla. Rol y objeto FILTRAN; `scopeGeneracion`
 * MULTIPLICA. Tenerlo en los dos sitios era la ambigüedad que v0.3 cerró (§6.2).
 */
function expandir(
  scope: string,
  roles: { rolCodigo: string | null }[],
  objetos: { objetoTipoCodigo: string }[],
  hechos: Hechos,
  esUn: (tipo: string | null | undefined, exigido: string) => boolean,
): { sujetoId?: string; objetoId?: string }[] {
  const rolesOk = roles.map((r) => r.rolCodigo).filter(Boolean) as string[];
  const tiposOk = objetos.map((o) => o.objetoTipoCodigo);
  const sujetos = (hechos.sujetos ?? []).filter((s) => rolesOk.length === 0 || (s.rol && rolesOk.includes(s.rol)));
  // is-a, NO igualdad: la regla pide INMUEBLE y el expediente trae una VIVIENDA.
  const objs = (hechos.objetos ?? []).filter((o) => tiposOk.length === 0 || tiposOk.some((t) => esUn(o.tipo, t)));

  switch (scope) {
    case 'POR_SUJETO': return sujetos.map((s) => ({ sujetoId: s.id }));
    case 'POR_OBJETO': return objs.map((o) => ({ objetoId: o.id }));
    case 'POR_SUJETO_Y_OBJETO':
      return sujetos.flatMap((s) => objs.map((o) => ({ sujetoId: s.id, objetoId: o.id })));
    default: return [{}];
  }
}
