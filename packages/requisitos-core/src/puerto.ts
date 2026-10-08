// EL PUERTO: qué necesita el motor de la base de datos, y nada más.
//
// POR QUÉ ESTO EXISTE (D30)
//
// El motor vive hoy en `consultor/src/lib/requisitos/` con su acceso tipado como
// `PrismaClient | Prisma.TransactionClient`. Eso arrastra el tipado de Prisma —y
// su VERSIÓN— a cualquier app que quiera usarlo, que es la razón por la que
// DocFilling no podía reutilizarlo y tendría que haber escrito un segundo motor
// de preguntas.
//
// Aquí se describe **sólo lo que el motor lee**: tres modelos, consultas de
// lectura, y de cada fila exactamente los campos que toca. Eso tiene un efecto
// secundario valioso: este fichero ES la documentación de lo que el motor
// necesita de la BD, y antes había que deducirlo leyendo 549 líneas.
//
// ⚠️ LAS FILAS SE DESCRIBEN POR LO QUE SE USA, NO POR EL SCHEMA. Si el schema
// gana un campo, aquí no cambia nada hasta que el motor lo lea. Y si un campo
// cambia de nulabilidad, el consumidor no compila — que es exactamente la
// protección que se busca.

/** `legal_act_documents_global` con sus relaciones incluidas. */
export interface ReglaGolden {
  id: string;
  codigo: string;
  descripcion: string | null;
  tipo: string;
  momento: string;
  scopeGeneracion: string;
  ccaaCodigo: string;
  documentoCodigo: string | null;
  estado: string;
  revisadoPor: string | null;
  tratamientoInstrumento: string;
  /** ⚠️ BOOLEANO, no el código de lo que sustituye: «esta regla sustituye a la
   *  que modifica» (el código está en `modificaCodigo`). Lo puse como
   *  `string | null` al escribir el puerto y lo cazó `tsc` al compilar el motor
   *  —`'string | null' y 'boolean' no se solapan`—, que es justo la protección
   *  que se busca: equivocar esto habría cambiado qué deltas sustituyen y qué
   *  complementan, en silencio. */
  sustituye: boolean | null;
  modificaCodigo: string | null;
  actoCodigo: string | null;
  /** `ACTO` o una transversal: `SUBFAMILIA`, `FAMILIA`, `TODOS`. Decide la precedencia
   *  (gana la más específica) y si un tipo de objeto que pide «acota». */
  ambito: string;
  /** Ejes de condición en columnas propias. `condObjeto`/`condSujeto` tienen su espejo en
   *  `objetos`/`roles` (medido: 240/240 y 249/249), pero forman parte de la COORDENADA con
   *  que se decide qué regla desplaza a cuál. Medio de pago y causa se evalúan con AND. */
  condObjeto: string | null;
  condSujeto: string | null;
  condMedioPago: string | null;
  condCausa: string | null;
  /** El grupo de evidencia por código (FK), sin cargar: entra en la coordenada de
   *  precedencia de las reglas que no piden un documento concreto. */
  evidenciaGrupoCodigo: string | null;

  condiciones: {
    /** El hecho se compone como `${ambito}.${codigo}`, y el resto es lo que
     *  convierte un hecho que falta en una PREGUNTA que se le puede hacer a una
     *  persona: su rótulo, el tipo de dato, las opciones si es una lista y de
     *  dónde se saca preferentemente. Sin estos cuatro campos el motor sabe qué
     *  le falta y no sabe cómo pedirlo. */
    atributoDef: {
      ambito: string;
      codigo: string;
      label: string;
      /** `AtributoTipoDato`: BOOLEANO, TEXTO, NUMERO, FECHA, LISTA… */
      tipoDato: string;
      /** `Json?`: las opciones de una LISTA. */
      opciones: unknown;
      fuentePreferente: string | null;
    };
    operador: string;
    /** `Json?` en el schema: el valor de una condición puede ser booleano,
     *  número, texto o lista. Tipado como `unknown` y no como `string`, que es
     *  lo que parecía al leer el motor. */
    valor: unknown;
    /** NO nulo (`Int` en el schema): el grupo 0 es «sin agrupar». */
    grupo: number;
    scopeRolCodigo: string | null;
  }[];
  roles: { rolCodigo: string | null; sujetoTipoCodigo: string | null }[];
  objetos: { objetoTipoCodigo: string }[];
  /** `responsable` NO es nulo en el schema; `metodo` y `comoObtener` sí. */
  obtencion: { responsable: string; metodo: string | null; comoObtener: string | null } | null;
  /** Ya ordenados por `orden`: el orden es parte del dato, no una preferencia. */
  fundamentos: { normaBoeId: string | null; articulo: string | null; nota: string | null }[];
  /** Ya ordenados por `prioridad`, por lo mismo. */
  evidenciaGrupo: {
    codigo: string;
    minRequerido: number;
    documentos: { documentTypeCodigo: string }[];
  } | null;
}

/** Un nodo de jerarquía de tipos (objeto o sujeto): `codigo` y su padre. */
export interface NodoTipo {
  codigo: string;
  parentCodigo: string | null;
}

/**
 * Lo que el motor necesita leer. Tres métodos, no tres modelos de Prisma: así el
 * consumidor puede servirlos desde donde quiera —Prisma, una caché, un fichero
 * en los tests— sin que el motor se entere.
 */
export interface RepositorioRequisitos {
  /**
   * Reglas que alcanzan a un acto, con el filtro de capa ya aplicado: las del acto y, cuando
   * `soloGolden`, también las TRANSVERSALES activas de ámbito `TODOS`, `FAMILIA` (la del acto) y
   * `SUBFAMILIA` (la del acto). La legacy no tiene transversales.
   */
  reglasDeActo(args: {
    actoCodigo: string;
    /** `null` = sin filtro de estado. */
    estados: string[] | null;
    /** Qué capa se sirve: ver `capa.ts`. */
    soloGolden: boolean;
  }): Promise<ReglaGolden[]>;

  /** Jerarquía de tipos de objeto (`objeto_tipo_global`). */
  tiposDeObjeto(): Promise<NodoTipo[]>;

  /** Jerarquía de tipos de sujeto (`sujeto_tipo_global`). */
  tiposDeSujeto(): Promise<NodoTipo[]>;

  /**
   * Jerarquía de ROLES (`rol_sujeto_global`). Llegó tarde —hasta octubre de 2026 el rol se
   * comparaba por igualdad de cadena— y ésa era la causa de que 81 reglas no alcanzaran a
   * nadie: las que el curador escribió sobre `ADQUIRENTE`, `DISPONENTE`, `CAUSAHABIENTE` y
   * `HEREDERO` para no repetir la identidad, el titular real o la ficha ATC en cada hijo.
   * Los cuatro nodos con hijos del catálogo llevan reglas encima: la jerarquía no era
   * decorativa, simplemente no la leía nadie.
   */
  tiposDeRol(): Promise<NodoTipo[]>;

  /** ¿Cuáles de estos actos sirve el catálogo universal? Es el dato `goldenSirve` del acto,
   *  no una deducción por filas: un acto puede tener reglas retiradas o ser un STUB curado
   *  sin reglas. Decide la capa en modo `auto`. */
  actosConGolden(actoCodigos: string[]): Promise<Set<string>>;
}
