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
  /**
   * De dónde le llega la regla al acto: la suya propia (`ACTO`) o una transversal de su
   * SUBFAMILIA, su FAMILIA o de TODOS los actos.
   */
  ambito: string;
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
   * Las condiciones de la regla en palabras, con el identificador exacto de cada dato entre
   * corchetes: «Estado civil [SUJETO.ESTADO_CIVIL] (rol VENDEDOR) = CASADO». Grupos alternativos
   * separados por « O ». Es lo que el evaluador por IA necesita para saber QUÉ buscar en las
   * fuentes (el motor sabe qué falta; sin esto, la IA no sabría qué significa).
   */
  condicionesTexto: string[];
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
/** Respuesta a la pregunta de tipo: «ninguno de los tipos ofrecidos». Descarta sus reglas. */
export const TIPO_NINGUNO = 'NINGUNO_DE_ESTOS';
/**
 * Los otros dos ejes de condición del catálogo que no son hechos de `atributo_defs_global`:
 * `condMedioPago` (cheque, transferencia, efectivo…) y `condCausa` (renuncia de herencia,
 * codicilo…). Viven en columnas propias de la regla y el motor NO los miraba, así que una regla
 * «sólo si se paga con cheque» o «sólo si la causa es la renuncia» salía FIRME siempre: 297
 * reglas de acto y 8 transversales. El medio de pago reutiliza el hecho `ACTO.MEDIO_PAGO`, que
 * admite una lista (se puede pagar parte por transferencia y parte con cheque).
 */
export const FACT_MEDIO_PAGO = 'ACTO.MEDIO_PAGO';
export const FACT_CAUSA = 'ACTO.CAUSA';

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
    /** De las consideradas, cuántas son transversales (TODOS, FAMILIA o SUBFAMILIA). */
    transversales: number;
    /** Desplazadas por una regla más específica que pide lo mismo bajo las mismas condiciones. */
    desplazadasPorEspecificidad: number;
  };
}

// ── evaluación ───────────────────────────────────────────────────────────────

const OPERADOR_TEXTO: Record<string, string> = {
  EQ: '=', NE: '≠', IN: 'es uno de', NOT_IN: 'no es ninguno de', GT: '>', GTE: '≥', LT: '<', LTE: '≤',
  INCLUYE: 'incluye', EXISTS: 'consta', NOT_EXISTS: 'no consta', IS_A: 'es un',
};
function valorTexto(v: unknown): string {
  if (v === true) return 'SÍ';
  if (v === false) return 'NO';
  if (Array.isArray(v)) return v.map(valorTexto).join(', ');
  return v === null || v === undefined ? '' : String(v);
}
/** Una condición en palabras, con su dato entre corchetes (ver `condicionesTexto`). */
function condicionTexto(c: Cond, label: string): string {
  const op = OPERADOR_TEXTO[c.operador] ?? c.operador;
  const rol = c.scopeRolCodigo ? ` (rol ${c.scopeRolCodigo})` : '';
  const valor = c.operador === 'EXISTS' || c.operador === 'NOT_EXISTS' ? '' : ` ${valorTexto(c.valor)}`;
  return `${label} [${c.fact}]${rol} ${op}${valor}`.trim();
}

const y = (a: Ternario, b: Ternario): Ternario =>
  a === false || b === false ? false : a === null || b === null ? null : true;

const o = (a: Ternario, b: Ternario): Ternario =>
  a === true || b === true ? true : a === null || b === null ? null : false;

/**
 * Valor de un dato que NO EXISTE para ese interviniente o ese bien: el régimen económico de un
 * soltero, el estado civil de una sociedad. No es desconocido —se sabe que no hay—, y tratarlo
 * como UNKNOWN dejaba en duda toda condición «algún interviniente…» en cuanto uno de ellos no
 * tenía el dato (medido en PROD el 8-oct-2026: 60 de 141 informes con «falta régimen» lo
 * tenían leído de los casados).
 *
 * Un interviniente o bien para quien el dato no existe **no cumple la condición, con
 * cualquier operador**: la condición habla de quienes pueden tenerlo. Primero lo hice
 * casar con NE/NOT_IN/NOT_EXISTS y la foto del motor lo cazó: GLOBAL-R50 («activo esencial = NO
 * o no consta», de la SOCIEDAD que interviene) pasaba a firme en 678 casos porque el vendedor
 * persona física «no tenía activo esencial».
 */
export const NO_APLICA = 'NO_APLICA';

function comparar(op: string, valor: unknown, esperado: unknown): Ternario {
  if (valor === undefined) return null;
  if (valor === NO_APLICA) return false;
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
    // El hecho puede ser un valor o una lista de valores: «¿se paga, entre otros, con cheque?».
    case 'INCLUYE': return Array.isArray(valor) ? valor.includes(esperado) : valor === esperado;
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
  /** Para qué tipo de interviniente o de bien existe el dato (`atributo_defs_global`
   *  `sujetoTipoCodigo`/`objetoTipoCodigo`): el estado civil, de persona física. En uno de otro
   *  tipo el dato vale NO_APLICA. Nulo = existe para todos. */
  paraTipo?: string | null;
};

/**
 * Datos que dependen de OTRO dato del mismo interviniente: sólo existen si éste tiene uno de
 * esos valores. No está en el catálogo (no hay columna para expresarlo), así que se declara
 * aquí, corto y a la vista. Si crece, sube a `atributo_defs_global`.
 */
const DEPENDE_DE: Record<string, { fact: string; valores: unknown[] }> = {
  'SUJETO.REGIMEN_ECONOMICO': { fact: 'ESTADO_CIVIL', valores: ['CASADO'] },
  'SUJETO.REGIMEN_ECONOMICO_MATRIMONIAL': { fact: 'ESTADO_CIVIL', valores: ['CASADO'] },
  'SUJETO.REGIMEN_ES_CAPITULADO': { fact: 'ESTADO_CIVIL', valores: ['CASADO'] },
  'SUJETO.CONYUGE_NO_SEPARADO': { fact: 'ESTADO_CIVIL', valores: ['CASADO'] },
};

/**
 * Datos que se DEDUCEN DEL ROL del interviniente cuando el expediente no los trae (8-oct-2026).
 * No se pueden presumir: una presunción vale igual para todos los intervinientes, y
 * `DISPONE_DE_SUS_BIENES` es cierto para el vendedor y falso para el comprador. Presumirlo
 * `false` callaba la autorización judicial cuando vende un menor; presumirlo `true` la pedía
 * cuando compra. El rol lo dice: lo que cuelga de DISPONENTE dispone y lo que cuelga de
 * ADQUIRENTE no. Un rol fuera de las dos ramas, o un interviniente sin rol, sigue sin saberse
 * (se pregunta). Un dato del expediente manda siempre sobre lo deducido.
 */
const DEDUCIDO_DEL_ROL: Record<string, [rolBase: string, valor: unknown][]> = {
  'SUJETO.DISPONE_DE_SUS_BIENES': [['DISPONENTE', true], ['ADQUIRENTE', false]],
};

/**
 * Datos del estado civil y familiar de una PARTE del negocio. Los del representante no
 * cuentan en una condición sin rol («algún interviniente casado en gananciales»): el que
 * comparece por otro no es quien vende ni quien compra.
 */
const DE_LA_PARTE = new Set([
  'SUJETO.ESTADO_CIVIL', 'SUJETO.REGIMEN_ECONOMICO', 'SUJETO.REGIMEN_ECONOMICO_MATRIMONIAL',
  'SUJETO.REGIMEN_ES_CAPITULADO', 'SUJETO.CONYUGE_NO_SEPARADO', 'SUJETO.VECINDAD_CIVIL',
  'SUJETO.PAREJA_ESTABLE', 'SUJETO.PAREJA_ESTABLE_INSCRITA',
]);
const ROL_REPRESENTANTE = 'REPRESENTANTE';
const RAICES_TIPO = new Set(['SUJETO', 'OBJETO']);

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
  /**
   * Cómo se decide que un rol cumple el `scopeRolCodigo` de una condición. Opcional y con
   * igualdad por defecto para no romper a quien ya llama a `evaluar` con cuatro argumentos;
   * el motor le pasa el recorrido por la jerarquía.
   */
  esUnRol: (rol: string | null | undefined, exigido: string) => boolean = (rol, exigido) => rol === exigido,
  /** La jerarquía de tipos de interviniente y de bien, para saber si un dato existe para él. */
  esUnTipo: (tipo: string | null | undefined, exigido: string) => boolean = (tipo, exigido) => tipo === exigido,
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
          ? (hechos.sujetos ?? []).filter((s) => c.scopeRolCodigo
            ? esUnRol(s.rol, c.scopeRolCodigo)
            : !(DE_LA_PARTE.has(c.fact) && esUnRol(s.rol, ROL_REPRESENTANTE)))
          : (hechos.objetos ?? []);
        // Sin intervinientes u objetos, la presunción hace de interviniente u objeto virtual.
        // El tipo de bien o de interviniente no es un atributo: vive en `tipo`, no en
        // `hechos`. Una condición sobre OBJETO.TIPO / SUJETO.TIPO (reglas propias de una
        // notaría) lo lee de ahí.
        const leer = (x: { tipo?: string | null; rol?: string | null; hechos: Record<string, unknown> }): unknown => {
          if (nombre === 'TIPO') return x.tipo ?? undefined;
          const v = x.hechos[nombre];
          if (v !== undefined) return v;
          // ¿Lo dice su rol? (DISPONE_DE_SUS_BIENES: vendedor sí, comprador no). Sólo con un rol
          // declarado: sin rol, el comodín de Redactor lo haría a la vez disponente y adquirente.
          if (x.rol) for (const [base, valor] of DEDUCIDO_DEL_ROL[c.fact] ?? []) if (esUnRol(x.rol, base)) return valor;
          // El dato no está: ¿es que no existe para éste? Por su tipo, o por el dato del que depende.
          if (c.paraTipo && !RAICES_TIPO.has(c.paraTipo) && x.tipo && !esUnTipo(x.tipo, c.paraTipo)) return NO_APLICA;
          const dep = DEPENDE_DE[c.fact];
          const base = dep ? x.hechos[dep.fact] : undefined;
          if (dep && base !== undefined && base !== null && base !== NO_APLICA && !dep.valores.includes(base)) return NO_APLICA;
          return undefined;
        };
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
  const objs = (hechos.objetos ?? []).map((ob) => ({ ...ob, tipo: ob.tipo ?? tipoPresumido ?? null, presumido: !ob.tipo && !!tipoPresumido }));
  if (objs.length === 0) {
    if (tipoPresumido) return aplicaPorObjeto(tiposRegla, { objetos: [{ id: '*', tipo: null, hechos: {} }] }, esUn, estrecha, tipoPresumido);
    return estrecha ? null : true;
  }
  const conTipo = objs.filter((o) => o.tipo);
  if (conTipo.some((o) => tiposRegla.some((t) => esUn(o.tipo, t)))) return true;
  // Un tipo PADRE del que pide la regla —«es urbano, no sé si vivienda»— no la descarta:
  // el bien podría ser ese subtipo. Solo un tipo ajeno (rústica frente a vivienda) descarta.
  // Salvo que el tipo sea PRESUNCIÓN: el escenario base presume el caso ordinario, y lo
  // excepcional se presume falso. Ver `aplicaPorSujeto`.
  if (conTipo.some((o) => !o.presumido && tiposRegla.some((t) => esUn(t, o.tipo as string)))) return null;
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
  const sujetos = (hechos.sujetos ?? []).map((su) => ({ ...su, tipo: su.tipo ?? tipoPresumido ?? null, presumido: !su.tipo && !!tipoPresumido }));
  if (sujetos.length === 0) {
    if (tipoPresumido) return aplicaPorSujeto(tiposRegla, { sujetos: [{ id: '*', tipo: null, hechos: {} }] }, esUn, tipoPresumido);
    return null;
  }
  const conTipo = sujetos.filter((s) => s.tipo);
  if (conTipo.some((s) => tiposRegla.some((t) => esUn(s.tipo, t)))) return true;
  // Un tipo conocido PADRE del que pide la regla no la descarta: una persona física puede ser
  // apoderado, menor o tener medidas de apoyo, y eso no se sabe. Pero un tipo PRESUMIDO es el
  // caso ordinario del escenario base —«persona física» que actúa por sí, mayor y sin apoyos—,
  // y ahí lo excepcional se presume falso, igual que las reglas del acto presumen
  // `SUJETO.ACTUA_POR_REPRESENTANTE = false`. Las transversales lo expresan con subtipos
  // (PF_APODERADO, PF_MENOR_*…): sin esto quedaban todas pendientes con el escenario puesto.
  if (conTipo.some((s) => !s.presumido && tiposRegla.some((t) => esUn(t, s.tipo as string)))) return null;
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
  /**
   * Un interviniente SIN rol cuenta para cualquier rol (menos el de representante). Es el caso
   * de Redactor: el operador contesta sobre «el interviniente» sin decir cuál, y las 175
   * condiciones acotadas a un rol («el VENDEDOR casado») no se resolvían nunca aunque se
   * contestaran (medido el 8-oct-2026: 9 preguntas en 0501, 8 en 1103). Los intervinientes con
   * rol —los que lee la IA— siguen acotando como siempre.
   */
  rolComodin?: boolean;
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
  const [tiposObj, tiposSuj, tiposRol] = await Promise.all([
    repo.tiposDeObjeto(),
    repo.tiposDeSujeto(),
    repo.tiposDeRol(),
  ]);
  const padres = new Map<string, string | null>();
  for (const t of [...tiposObj, ...tiposSuj]) padres.set(t.codigo, t.parentCodigo);
  // Mapa APARTE para los roles. Hoy no hay ni un código repetido entre los tres catálogos
  // —comprobado—, así que cabrían en el mismo; pero una colisión futura entre, digamos, un
  // tipo de sujeto y un rol homónimos daría un padre equivocado sin avisar de nada.
  const padresRol = new Map<string, string | null>();
  for (const t of tiposRol) padresRol.set(t.codigo, t.parentCodigo);
  const sube = (mapa: Map<string, string | null>) =>
    (tipo: string | null | undefined, exigido: string): boolean => {
      let t: string | null | undefined = tipo;
      const visto = new Set<string>();
      while (t && !visto.has(t)) {
        if (t === exigido) return true;
        visto.add(t);
        t = mapa.get(t) ?? null;
      }
      return false;
    };
  /** `VIVIENDA` cumple una regla que pide `URBANO`, `INMUEBLE` u `OBJETO`. */
  const esUn = sube(padres);
  /**
   * Las opciones de la pregunta «¿qué tipo es?»: los tipos que piden las reglas en duda y
   * «Ninguno de estos». Sólo con los pedidos la pregunta podía no tener respuesta —un aumento
   * de capital (1936) de una SL preguntaba el tipo de interviniente con una única opción, «SA»
   * (8-oct-2026)—. Ofrecer además los tipos hermanos llenaba el panel de opciones que ninguna
   * regla pide; decisión de Carles: los pedidos y «Ninguno de estos». Ese valor no está en la
   * jerarquía, así que el motor lo trata como un tipo conocido que no es ninguno de los pedidos
   * y descarta esas reglas, sin lógica aparte.
   */
  const opcionesDeTipo = (pedidos: string[]): string[] => [...new Set(pedidos)].sort().concat(TIPO_NINGUNO);
  /** Y un `VENDEDOR` cumple una regla escrita para `DISPONENTE`. Mismo recorrido, otro mapa. */
  const subeRol = sube(padresRol);
  const esUnRol = opciones.rolComodin
    ? (rol: string | null | undefined, exigido: string) => (rol ? subeRol(rol, exigido) : exigido !== ROL_REPRESENTANTE)
    : subeRol;

  // Qué reglas alcanzan al acto: las suyas y, si lo sirve el catálogo universal, también
  // las TRANSVERSALES —las de TODOS los actos, las de su FAMILIA y las de su SUBFAMILIA—. La
  // consulta la hace el adaptador (`puerto.ts` dice qué debe devolver): el filtro de capa,
  // los `include` y los `orderBy` son suyos, y es lo que permite que este motor no sepa de
  // Prisma (D30). La legacy no tiene transversales: todas sus filas llevan acto.
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
    transversales: reglas.filter((r) => r.ambito !== 'ACTO').length,
    desplazadasPorEspecificidad: 0,
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
  const supervivientes = aplicables.filter((r) => {
    if (sustituidos.has(r.codigo)) { diag.sustituidasPorDelta++; return false; }
    return true;
  });

  // 2 bis. Precedencia: GANA LA MÁS ESPECÍFICA, no la más estricta (decisión de Carles,
  //    3-oct-2026; la misma regla que `matrizEfectiva`). Dos reglas compiten si piden LO MISMO
  //    BAJO LAS MISMAS CONDICIONES —misma coordenada—; entonces la del acto desplaza a la de su
  //    subfamilia, ésta a la de la familia y ésta a la de TODOS. Es lex specialis: la familia
  //    puede reforzar el default transversal o relajarlo. Dentro de un mismo ámbito no compiten:
  //    son hermanas y salen las dos.
  const ESPECIFICIDAD: Record<string, number> = { ACTO: 3, SUBFAMILIA: 2, FAMILIA: 1, TODOS: 0 };
  const coordenada = (r: (typeof reglas)[number]) =>
    [r.documentoCodigo ?? `GE:${r.evidenciaGrupoCodigo ?? ''}`, r.ccaaCodigo,
     r.condObjeto ?? '', r.condSujeto ?? '', r.condMedioPago ?? '', r.condCausa ?? ''].join('\u0001');
  const masEspecifica = new Map<string, number>();
  for (const r of supervivientes) {
    const k = coordenada(r);
    masEspecifica.set(k, Math.max(masEspecifica.get(k) ?? -1, ESPECIFICIDAD[r.ambito] ?? 3));
  }
  const vivas = supervivientes.filter((r) => {
    if ((ESPECIFICIDAD[r.ambito] ?? 3) < masEspecifica.get(coordenada(r))!) { diag.desplazadasPorEspecificidad++; return false; }
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
  // ⚠️ Sólo con las reglas PROPIAS del acto: las transversales declaran tipos de cualquier
  // acto (VEHICULO, VALORES, EMPRESA_NEGOCIO…) y no dicen nada de cuál es el bien de éste.
  const declarados = new Set(vivas.filter((r) => r.ambito === 'ACTO').flatMap((r) => r.objetos.map((o) => o.objetoTipoCodigo)));
  const estrecha = (t: string) => [...declarados].some((d) => d !== t && esUn(t, d));

  const firmes: RequisitoResuelto[] = [];
  const condicionados: RequisitoResuelto[] = [];
  const descartados: RequisitoResuelto[] = [];
  const preguntas = new Map<string, Pregunta>();

  for (const r of vivas) {
    const conds: Cond[] = r.condiciones.map((c) => ({
      fact: `${c.atributoDef.ambito}.${c.atributoDef.codigo}`,
      operador: c.operador, valor: c.valor, scopeRolCodigo: c.scopeRolCodigo, grupo: c.grupo,
      paraTipo: c.atributoDef.ambito === 'SUJETO' ? c.atributoDef.sujetoTipoCodigo ?? null
        : c.atributoDef.ambito === 'OBJETO' ? c.atributoDef.objetoTipoCodigo ?? null : null,
    }));
    // Medio de pago y causa van APARTE y se combinan con AND: `conds` se agrupan con OR entre
    // grupos, y meterlas como un grupo más las convertiría en alternativas en vez de requisitos.
    const ejes: Cond[] = [
      ...(r.condMedioPago ? [{ fact: FACT_MEDIO_PAGO, operador: 'INCLUYE', valor: r.condMedioPago, scopeRolCodigo: null, grupo: 0 }] : []),
      ...(r.condCausa ? [{ fact: FACT_CAUSA, operador: 'EQ', valor: r.condCausa, scopeRolCodigo: null, grupo: 0 }] : []),
    ];
    const labelDe = new Map(r.condiciones.map((c) => [`${c.atributoDef.ambito}.${c.atributoDef.codigo}`, c.atributoDef.label]));
    const grupos = new Map<number, string[]>();
    for (const c of conds) (grupos.get(c.grupo) ?? grupos.set(c.grupo, []).get(c.grupo)!).push(condicionTexto(c, labelDe.get(c.fact) ?? c.fact));
    const condicionesTexto: string[] = [];
    if (grupos.size) condicionesTexto.push([...grupos.values()].map((g) => g.join(' y ')).join(' O '));
    if (r.condMedioPago) condicionesTexto.push(`Medio de pago [${FACT_MEDIO_PAGO}] incluye ${r.condMedioPago}`);
    if (r.condCausa) condicionesTexto.push(`Causa o modalidad del acto [${FACT_CAUSA}] = ${r.condCausa}`);
    const porCuerpo = evaluar(conds, hechos, ambitoDe, presunciones, esUnRol, esUn);
    const porEjes = evaluar(ejes, hechos, ambitoDe, presunciones, esUnRol, esUn);
    const valorCond = y(porCuerpo.valor, porEjes.valor);
    const porCondicion = {
      valor: valorCond,
      faltan: valorCond === null ? [...porCuerpo.faltan, ...porEjes.faltan] : [],
      presumidos: [...porCuerpo.presumidos, ...porEjes.presumidos],
    };
    const tiposRegla = r.objetos.map((o) => o.objetoTipoCodigo);
    // Una transversal que pide un tipo que el acto no declara SIEMPRE acota: la tarjeta ITV
    // es de vehículos, y en una compraventa de inmuebles sin saber el bien queda pendiente,
    // no firme. Si pide el tipo base del acto (INMUEBLE en 0501) se comporta como las suyas.
    const transversal = r.ambito !== 'ACTO';
    const acotaPorObjeto = tiposRegla.length > 0 && tiposRegla.every((t) => estrecha(t) || (transversal && !declarados.has(t)));
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
      ambito: r.ambito,
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
      condicionada: conds.length > 0 || ejes.length > 0 || acotaPorObjeto || tiposSujeto.length > 0,
      porPresuncion: valor === null ? [] : [...new Set([...porCondicion.presumidos, ...presumidosTipo])],
      roles: [...new Set(r.roles.map((x) => x.rolCodigo).filter(Boolean) as string[])],
      hechosQueDecide: [...new Set([...conds.map((c) => c.fact), ...ejes.map((c) => c.fact), ...(acotaPorObjeto ? [FACT_TIPO_OBJETO] : []), ...(tiposSujeto.length ? [FACT_TIPO_SUJETO] : [])])],
      condicionesTexto: [
        ...condicionesTexto,
        ...(acotaPorObjeto ? [`El bien es de tipo [${FACT_TIPO_OBJETO}] ${tiposRegla.join(' o ')}`] : []),
        ...(tiposSujeto.length ? [`Algún interviniente es de tipo [${FACT_TIPO_SUJETO}] ${tiposSujeto.join(' o ')}`] : []),
      ],
      instancias: expandir(r.scopeGeneracion, r.roles, r.objetos, hechos, esUn, esUnRol),
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
      // Medio de pago y causa no tienen `AtributoDef` propio en todas las bases: la pregunta se
      // compone aquí con los valores que de verdad distinguen algo en este acto.
      for (const e of ejes) {
        if (!faltan.includes(e.fact)) continue;
        const p = preguntas.get(e.fact) ?? {
          fact: e.fact,
          label: e.fact === FACT_CAUSA ? 'Causa o modalidad del acto' : 'Medio de pago',
          tipoDato: 'ENUM',
          opciones: [] as string[],
          fuentePreferente: null,
          bloquea: [],
        };
        if (Array.isArray(p.opciones)) p.opciones = [...new Set([...(p.opciones as string[]), e.valor as string])].sort();
        if (!p.bloquea.includes(r.codigo)) p.bloquea.push(r.codigo);
        preguntas.set(e.fact, p);
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
        p.opciones = opcionesDeTipo([...(p.opciones as string[]).filter((x) => x !== TIPO_NINGUNO), ...tiposSujeto]);
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
        p.opciones = opcionesDeTipo([...(p.opciones as string[]).filter((x) => x !== TIPO_NINGUNO), ...tiposRegla]);
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
  esUnRol: (rol: string | null | undefined, exigido: string) => boolean,
): { sujetoId?: string; objetoId?: string }[] {
  const rolesOk = roles.map((r) => r.rolCodigo).filter(Boolean) as string[];
  const tiposOk = objetos.map((o) => o.objetoTipoCodigo);
  const sujetos = (hechos.sujetos ?? []).filter((s) => rolesOk.length === 0 || rolesOk.some((r) => esUnRol(s.rol, r)));
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
