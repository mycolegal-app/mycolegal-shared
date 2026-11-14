// EL ADAPTADOR PRISMA DEL MOTOR DE REQUISITOS — uno para toda la flota.
//
// POR QUÉ VIVE AQUÍ Y NO EN CADA APP
//
// `@mycolegal-app/requisitos-core` pide un puerto de cuatro métodos y **no sabe
// de Prisma a propósito** (D30): así el motor no arrastra el tipado ni la
// versión de Prisma a sus consumidores. Pero entonces alguien tiene que
// implementar ese puerto contra la base, y ese alguien era **cada app**: lo
// escribí primero dentro de DocFilling y Carles lo paró con la pregunta
// correcta —«¿por qué tienes esto en la app?»—. Consultor, Notaría y LegiFirma
// lo habrían reescrito igual, y tres copias del mismo `include` acaban
// discrepando en el detalle que importa: el ORDEN.
//
// Aquí es su sitio porque `sharedlib` es la fontanería que sí conoce Prisma.
//
// EL CLIENTE SE RECIBE ESTRUCTURALMENTE, no como `PrismaClient`
//
// Misma razón que el puerto: pedir `PrismaClient` ataría este módulo al cliente
// generado de UNA app, y cada app genera el suyo desde su propio espejo. Se
// piden los tres modelos que el motor lee y nada más, así que vale cualquier
// cliente que los tenga —y un `fake` en un test—.
// `@mycolegal-app/requisitos-core` es peerDependency **OPCIONAL**, igual que
// `@prisma/client`: sólo la necesita quien importe este módulo. Marcarla sin el
// `optional` fue un error mío —npm la instaló en las **14** apps que usan
// sharedlib cuando sólo DocFilling la declara y la usa—, y el coste no es el
// disco: un cambio incompatible en el motor podría romper el `npm install` de
// trece apps que no lo tocan.
import type { RepositorioRequisitos, ReglaGolden, NodoTipo, FilaEscenario, FilaTransversal, AjustePresuncion, DerivadoDef, PreguntaPor, ExisteSiDef } from '@mycolegal-app/requisitos-core';
import { ORIGEN_GOLDEN } from '@mycolegal-app/requisitos-core';

// Se declara aquí y no se importa: `requisitos-core` lo exporta desde la versión de las dos
// capas, y la dependencia es `>=0.1.0`. Con una app que tenga el core anterior, el import
// llegaría `undefined` y el `[...]` reventaría en tiempo de ejecución.
const ORIGENES_UNIVERSAL = [ORIGEN_GOLDEN, 'BASICO'] as const;

/**
 * Lo que el adaptador necesita del cliente: tres modelos, sólo lectura.
 *
 * ⚠️ `args: any`, y no es pereza: el `findMany` que Prisma GENERA es genérico
 * (`<T extends …FindManyArgs>(args?: SelectSubset<T, …>)`), y por la
 * contravarianza del parámetro **ningún tipo estructural concreto le encaja** —
 * un `Record<string, unknown>` exige aceptar cualquier clave y el de Prisma
 * sólo acepta las suyas, así que el compilador lo rechaza. Lo comprobé
 * pasándole el cliente de verdad.
 *
 * Lo que sí queda tipado es lo que importa: el RETORNO se afirma contra
 * `ReglaGolden` y `NodoTipo`, que es el contrato que el motor consume. Si el
 * espejo de una app no tiene estos tres modelos, falla al construir el objeto,
 * no al leer una fila.
 */
export interface ClienteGolden {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  legalActDocumentGlobal: { findMany(args: any): Promise<any[]> };
  /** `goldenSirve` (capa) y la familia/subfamilia del acto (transversales). */
  legalActGlobal: { findMany(args: any): Promise<any[]> };
  objetoTipoGlobal: { findMany(args: any): Promise<any[]> };
  sujetoTipoGlobal: { findMany(args: any): Promise<any[]> };
  rolSujetoGlobal: { findMany(args: any): Promise<any[]> };
  /** Escenarios base (requisitos-core 0.3.3). OPCIONALES: si el espejo de la app no los tiene,
   *  el acto va sin escenario, como antes. */
  actoEscenarioBase?: { findMany(args: any): Promise<any[]> };
  presuncionTransversalGlobal?: { findMany(args: any): Promise<any[]> };
  actoPresuncionOverride?: { findMany(args: any): Promise<any[]> };
  /** Datos derivados (requisitos-core 0.3.12): `atributo_defs_global.deriva` se lee por SQL, porque
   *  los espejos de las apps no llevan la columna (como `concretaPapel`, para no dar P2022 en un
   *  entorno sin migrar). OPCIONAL: sin él, o sin la columna, no se deriva nada. */
  $queryRawUnsafe?(query: string, ...values: any[]): Promise<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * El `include` del golden. **Es parte del contrato, no una preferencia.**
 *
 * `puerto.ts` promete que los fundamentos llegan ordenados por `orden` y los
 * documentos del grupo de evidencia por `prioridad`, porque **el orden ES el
 * dato**: el primer fundamento es el que se cita. Si cada app escribiera su
 * propio `include`, la que olvidara un `orderBy` citaría otro artículo sin que
 * nada fallara. Por eso está escrito una vez y aquí.
 */
const INCLUDE_GOLDEN = {
  condiciones: { include: { atributoDef: true } },
  roles: true,
  objetos: true,
  obtencion: true,
  fundamentos: { orderBy: { orden: 'asc' } },
  evidenciaGrupo: { include: { documentos: { orderBy: { prioridad: 'asc' } } } },
} as const;

/** Catálogo universal = `origen` IA (o el BASICO de cuando el libro era otra capa);
 *  heredada = todo lo demás. Es el filtro de capa, y vive en el adaptador porque es
 *  una cláusula `where`, no una decisión del motor. */
function whereCapa(universal: boolean): Record<string, unknown> {
  const origenes = [...ORIGENES_UNIVERSAL];
  return universal ? { origen: { in: origenes } } : { origen: { notIn: origenes } };
}

/**
 * Un `RepositorioRequisitos` sobre un cliente Prisma.
 *
 * ```ts
 * import { prisma } from '@/lib/db';
 * const repo = crearRepositorioRequisitos(prisma);
 * const r = await resolverRequisitos(repo, '0501', hechos);
 * ```
 */
export function crearRepositorioRequisitos(client: ClienteGolden): RepositorioRequisitos {
  return {
    async reglasDeActo({ actoCodigo, estados, soloGolden }) {
      // Las del acto y, en el catálogo universal, las TRANSVERSALES que le alcanzan: TODOS,
      // su FAMILIA y su SUBFAMILIA. La legacy no tiene transversales. Hasta 0.3.0 sólo se
      // leían las del acto y Redactor no veía ni una transversal (identidad, medios de pago,
      // consulta de listas…): sólo existían en la copia del motor de Consultor.
      const alcance: Record<string, unknown>[] = [{ actoCodigo }];
      if (soloGolden) {
        const [acto] = await client.legalActGlobal.findMany({
          where: { codigo: actoCodigo }, select: { familiaCodigo: true, subfamiliaCodigo: true }, take: 1,
        }) as { familiaCodigo: string | null; subfamiliaCodigo: string | null }[];
        alcance.push({ ambito: 'TODOS', actoCodigo: null });
        if (acto?.familiaCodigo) alcance.push({ ambito: 'FAMILIA', actoCodigo: null, familiaCodigo: acto.familiaCodigo });
        if (acto?.subfamiliaCodigo) alcance.push({ ambito: 'SUBFAMILIA', actoCodigo: null, subfamiliaCodigo: acto.subfamiliaCodigo });
      }
      const filas = await client.legalActDocumentGlobal.findMany({
        where: {
          OR: alcance,
          active: true,
          ...whereCapa(soloGolden),
          ...(estados ? { estado: { in: estados } } : {}),
        },
        include: INCLUDE_GOLDEN,
      });
      return filas as ReglaGolden[];
    },

    async tiposDeObjeto() {
      const filas = await client.objetoTipoGlobal.findMany({
        select: { codigo: true, parentCodigo: true },
      });
      return filas as NodoTipo[];
    },

    async tiposDeSujeto() {
      const filas = await client.sujetoTipoGlobal.findMany({
        select: { codigo: true, parentCodigo: true },
      });
      return filas as NodoTipo[];
    },

    async tiposDeRol() {
      const filas = (await client.rolSujetoGlobal.findMany({
        select: { codigo: true, parentCodigo: true, implicaAcompanado: true },
      })) as { codigo: string; parentCodigo: string | null; implicaAcompanado?: unknown }[];
      // Un papel que «implica algo» para la persona a la que acompaña (representante,
      // asistente, intérprete) no es parte del negocio: el motor lo trata así sin conocer
      // ningún código.
      return filas.map((f) => ({
        codigo: f.codigo,
        parentCodigo: f.parentCodigo,
        acompana: !!f.implicaAcompanado && typeof f.implicaAcompanado === 'object' && Object.keys(f.implicaAcompanado as object).length > 0,
      })) as NodoTipo[];
    },

    async actosConGolden(actoCodigos) {
      if (actoCodigos.length === 0) return new Set();
      // Es un DATO, no una deducción por filas: `goldenSirve` lo enciende el cargador en
      // todo acto al que el contrato trae reglas. Contar reglas activas fallaba en los dos
      // sentidos: un acto con reglas retiradas, o un STUB curado sin reglas (1901).
      const filas = await client.legalActGlobal.findMany({
        where: { codigo: { in: actoCodigos }, goldenSirve: true },
        select: { codigo: true },
      }) as { codigo: string }[];
      return new Set(filas.map((f) => f.codigo));
    },

    // ── Escenarios base (9-oct-2026) ─────────────────────────────────────────
    // Lo que el Redactor no tenía: sin esto llamaba al motor sin presunciones y en una
    // compraventa preguntaba 71 cosas en vez de 6. La composición está en requisitos-core
    // (`escenarioPara`); aquí sólo se leen las filas, en el orden que es parte del dato.

    async escenariosDeActo(actoCodigo) {
      if (!client.actoEscenarioBase) return [];
      const filas = await client.actoEscenarioBase.findMany({
        where: { actoCodigo },
        include: { presunciones: { orderBy: { orden: 'asc' } } },
        orderBy: [{ porDefecto: 'desc' }, { codigo: 'asc' }],
      }) as {
        actoCodigo: string; codigo: string; nombre: string; porDefecto: boolean; objetoTipoCodigo: string | null;
        esquemasDocFilling: unknown; estado: string; revisadoPor: string | null; condiciones: unknown;
        presunciones: { fact: string; modo: string; valor: unknown; tema: string | null; situacion: string | null; porQue: string | null }[];
      }[];
      return filas.map((f): FilaEscenario => ({
        actoCodigo: f.actoCodigo, codigo: f.codigo, nombre: f.nombre, porDefecto: f.porDefecto,
        objetoTipoCodigo: f.objetoTipoCodigo,
        esquemasDocFilling: Array.isArray(f.esquemasDocFilling) ? (f.esquemasDocFilling as unknown[]).map(String) : [],
        estado: f.estado, revisadoPor: f.revisadoPor,
        condiciones: Array.isArray(f.condiciones) ? (f.condiciones as FilaEscenario['condiciones']) : [],
        presunciones: f.presunciones.map((p) => ({ fact: p.fact, modo: p.modo, valor: p.valor, tema: p.tema, situacion: p.situacion, porQue: p.porQue })),
      }));
    },

    async presuncionesTransversales(actoCodigo) {
      if (!client.presuncionTransversalGlobal) return [];
      const [acto] = await client.legalActGlobal.findMany({
        where: { codigo: actoCodigo }, select: { familiaCodigo: true, subfamiliaCodigo: true }, take: 1,
      }) as { familiaCodigo: string | null; subfamiliaCodigo: string | null }[];
      const or: Record<string, unknown>[] = [{ ambito: 'TODOS' }];
      if (acto?.familiaCodigo) or.push({ ambito: 'FAMILIA', familiaCodigo: acto.familiaCodigo });
      if (acto?.subfamiliaCodigo) or.push({ ambito: 'SUBFAMILIA', subfamiliaCodigo: acto.subfamiliaCodigo });
      const filas = await client.presuncionTransversalGlobal.findMany({
        where: { OR: or },
        select: { ambito: true, fichero: true, fact: true, modo: true, valor: true, objetoTipoCodigo: true, ccaaCodigo: true, tema: true, situacion: true, porQue: true },
      });
      return filas as FilaTransversal[];
    },

    async ajustesDePresuncion(orgId, actoCodigo) {
      if (!client.actoPresuncionOverride) return [];
      const filas = await client.actoPresuncionOverride.findMany({
        where: { orgId, actoCodigo },
        select: { id: true, escenarioCodigo: true, fact: true, modo: true, valor: true, motivo: true },
      });
      return filas as AjustePresuncion[];
    },

    // ── Datos derivados (7-nov-2026, catálogo 1.1.63) ──────────────────────────
    async derivados() {
      if (!client.$queryRawUnsafe) return [];
      type Tramo = { valor?: unknown; porQue?: unknown; si?: { fact?: unknown; op?: unknown; valor?: unknown; scopeRol?: unknown }[] };
      let filas: { ambito: string; codigo: string; deriva: unknown }[];
      try {
        filas = await client.$queryRawUnsafe(
          'SELECT "ambito", "codigo", "deriva" FROM "atributo_defs_global" WHERE "deriva" IS NOT NULL');
      } catch { return []; } // sin la columna: un entorno sin la migración `atributo_deriva`
      if (!filas.length) return [];
      // El tipo para el que existe cada dato de las condiciones, como en una condición de regla.
      // Un dato con filas de tipos distintos no se acota (null).
      const citados = [...new Set(filas.flatMap((f) => (Array.isArray(f.deriva) ? f.deriva as Tramo[] : [])
        .flatMap((t) => (t.si ?? []).map((c) => String(c.fact ?? '')))))].filter(Boolean);
      const defs = citados.length ? await client.$queryRawUnsafe(
        'SELECT "ambito", "codigo", "sujetoTipoCodigo" AS suj, "objetoTipoCodigo" AS obj, "label", "tipoDato", "opciones", "fuentePreferente" FROM "atributo_defs_global" WHERE ("ambito" || \'.\' || "codigo") = ANY($1)',
        citados) as { ambito: string; codigo: string; suj: string | null; obj: string | null; label: string; tipoDato: string; opciones: unknown; fuentePreferente: string | null }[] : [];
      const tipos = new Map<string, Set<string | null>>();
      for (const d of defs) {
        const k = `${d.ambito}.${d.codigo}`;
        (tipos.get(k) ?? tipos.set(k, new Set()).get(k)!).add(d.ambito === 'SUJETO' ? d.suj : d.ambito === 'OBJETO' ? d.obj : null);
      }
      const paraTipo = (fact: string) => { const t = tipos.get(fact); return t && t.size === 1 ? [...t][0] : null; };
      // Cómo se pregunta cada dato si su tramo queda en duda: la primera fila, que es la misma pregunta.
      const comoPreguntar = new Map<string, { label: string; tipoDato: string; opciones: unknown; fuentePreferente: string | null }>();
      for (const d of defs) {
        const k = `${d.ambito}.${d.codigo}`;
        if (!comoPreguntar.has(k)) comoPreguntar.set(k, { label: d.label, tipoDato: d.tipoDato, opciones: d.opciones ?? null, fuentePreferente: d.fuentePreferente ?? null });
      }
      const vistos = new Set<string>();
      return filas.flatMap((f): DerivadoDef[] => {
        const fact = `${f.ambito}.${f.codigo}`;
        if (vistos.has(fact) || !Array.isArray(f.deriva)) return [];
        vistos.add(fact);
        return [{
          fact,
          tramos: (f.deriva as Tramo[]).map((t) => ({
            valor: t.valor,
            porQue: typeof t.porQue === 'string' ? t.porQue : null,
            si: (t.si ?? []).map((c) => ({
              fact: String(c.fact), op: String(c.op), valor: c.valor,
              scopeRol: typeof c.scopeRol === 'string' ? c.scopeRol : null, paraTipo: paraTipo(String(c.fact)),
              ...(comoPreguntar.has(String(c.fact)) ? { def: comoPreguntar.get(String(c.fact))! } : {}),
            })),
          })),
        }];
      });
    },

    // ── Cuándo existe un dato (14-nov-2026, requisitos-core 0.3.16) ───────────
    async existencias() {
      if (!client.$queryRawUnsafe) return [];
      type Cond = { fact?: unknown; op?: unknown; valor?: unknown };
      let filas: { ambito: string; codigo: string; existeSi: unknown }[];
      try {
        filas = await client.$queryRawUnsafe(
          'SELECT "ambito", "codigo", "existeSi" FROM "atributo_defs_global" WHERE "existeSi" IS NOT NULL');
      } catch { return []; } // sin la columna: un entorno sin la migración `atributo_existe_si`
      if (!filas.length) return [];
      // Cómo se pregunta cada dato de las condiciones, para preguntarlo a él si falta.
      const citados = [...new Set(filas.flatMap((f) => (Array.isArray(f.existeSi) ? f.existeSi as Cond[] : []).map((c) => String(c.fact ?? ''))))].filter(Boolean);
      const defs = citados.length ? await client.$queryRawUnsafe(
        'SELECT "ambito", "codigo", "label", "tipoDato", "opciones", "fuentePreferente" FROM "atributo_defs_global" WHERE ("ambito" || \'.\' || "codigo") = ANY($1)',
        citados) as { ambito: string; codigo: string; label: string; tipoDato: string; opciones: unknown; fuentePreferente: string | null }[] : [];
      const comoPreguntar = new Map<string, { label: string; tipoDato: string; opciones: unknown; fuentePreferente: string | null }>();
      for (const d of defs) {
        const k = `${d.ambito}.${d.codigo}`;
        if (!comoPreguntar.has(k)) comoPreguntar.set(k, { label: d.label, tipoDato: d.tipoDato, opciones: d.opciones ?? null, fuentePreferente: d.fuentePreferente ?? null });
      }
      const vistos = new Set<string>();
      return filas.flatMap((f): ExisteSiDef[] => {
        const fact = `${f.ambito}.${f.codigo}`;
        if (vistos.has(fact) || !Array.isArray(f.existeSi) || !f.existeSi.length) return [];
        vistos.add(fact);
        return [{
          fact,
          si: (f.existeSi as Cond[]).filter((c) => c.fact && c.op).map((c) => ({
            fact: String(c.fact), op: String(c.op), valor: c.valor,
            ...(comoPreguntar.has(String(c.fact)) ? { def: comoPreguntar.get(String(c.fact))! } : {}),
          })),
        }];
      });
    },

    // ── Preguntar un dato por otro (7-nov-2026, catálogo 1.1.64) ───────────────
    async preguntasPor() {
      if (!client.$queryRawUnsafe) return [];
      let filas: { ambito: string; codigo: string; por: string }[];
      try {
        filas = await client.$queryRawUnsafe(
          'SELECT DISTINCT "ambito", "codigo", "preguntaPor" AS por FROM "atributo_defs_global" WHERE "preguntaPor" IS NOT NULL');
      } catch { return []; } // sin la columna: un entorno sin la migración `atributo_pregunta_por`
      if (!filas.length) return [];
      const destinos = [...new Set(filas.map((f) => f.por))];
      const defs = await client.$queryRawUnsafe(
        'SELECT "ambito", "codigo", "label", "tipoDato", "opciones", "fuentePreferente" FROM "atributo_defs_global" WHERE ("ambito" || \'.\' || "codigo") = ANY($1)',
        destinos) as { ambito: string; codigo: string; label: string; tipoDato: string; opciones: unknown; fuentePreferente: string | null }[];
      const comoPreguntar = new Map<string, PreguntaPor['def']>();
      for (const d of defs) {
        const k = `${d.ambito}.${d.codigo}`;
        if (!comoPreguntar.has(k)) comoPreguntar.set(k, { label: d.label, tipoDato: d.tipoDato, opciones: d.opciones ?? null, fuentePreferente: d.fuentePreferente ?? null });
      }
      // Sin la definición del dato por el que se pregunta, no se sabe preguntarlo: se pregunta el original.
      return filas.flatMap((f): PreguntaPor[] => {
        const def = comoPreguntar.get(f.por);
        return def ? [{ fact: `${f.ambito}.${f.codigo}`, por: f.por, def }] : [];
      });
    },
  };
}
