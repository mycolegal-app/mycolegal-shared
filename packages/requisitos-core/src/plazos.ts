/**
 * Plazos de presentación por comunidad (plan PLAZOS_PRESENTACION_CCAA, 24-nov-2026). Pura y SIN CRITERIO PROPIO.
 *
 * Todo lo que es Derecho vive en el catálogo (`catalogos/plazos_presentacion.json`, de `vocabulario/plazos_presentacion.md`):
 *   · `impuestos[].puntoConexion`: qué hecho dice la comunidad competente, por tramos (`si` + `ccaa`), el primero que se
 *     cumple — Ley 22/2009, arts. 32 y 33, con su cita en cada tramo;
 *   · `plazos`: el plazo de cada impuesto en cada comunidad (o la fila por defecto), con su cita y vigencia;
 *   · `resolucion` (global y, si lo lleva, por impuesto, que gana): `porDefecto`, `equivalencias` (p. ej. el extranjero →
 *     la estatal), `sinPlazoUnico` (valores para los que no hay un plazo, con su aviso) y `siNoConsta` (qué comunidad se
 *     supone si el hecho no consta —`NOTARIA` es la de la notaría— y con qué aviso).
 * Aquí sólo se recorre eso. No hay ni un código de impuesto, de comunidad ni un artículo en este fichero.
 */

export type UnidadPlazo = 'DIAS_HABILES' | 'DIAS_NATURALES' | 'MESES' | 'ANIOS';

export interface CondicionPlazo { fact: string; op: string; valor?: unknown }
export interface TramoConexion { si?: CondicionPlazo[]; ccaa: string; cita: string }
export interface ResolucionPlazos {
  porDefecto?: string;
  equivalencias?: Record<string, string>;
  sinPlazoUnico?: { valor: string; aviso: string }[];
  siNoConsta?: { ccaa: string; aviso: string };
}
export interface FilaPlazo {
  impuesto: string;
  ccaa: string;
  cantidad: number;
  unidad: UnidadPlazo;
  computo?: string | null;
  cita: string;
  vigenteDesde?: string | null;
}
export interface TablaPlazos {
  resolucion?: ResolucionPlazos;
  impuestos: { codigo: string; puntoConexion: TramoConexion[]; resolucion?: ResolucionPlazos }[];
  plazos: FilaPlazo[];
}

/** Los hechos del caso, en la forma del motor (`Hechos`), y la jerarquía de tipos para `ES_UN`. */
export interface CasoPlazo {
  acto?: Record<string, unknown>;
  objetos?: { id: string; tipo?: string | null; hechos: Record<string, unknown> }[];
  sujetos?: { id: string; tipo?: string | null; hechos: Record<string, unknown> }[];
}

/**
 * - `RESUELTO`: el hecho consta y hay plazo (`fila`).
 * - `SUPUESTO`: el hecho no consta; se ha tomado la comunidad de `siNoConsta` (`aviso` dice cuál y qué confirmar).
 * - `SIN_PLAZO_UNICO`: el valor está en `sinPlazoUnico` (p. ej. bienes en varias comunidades); `aviso`, el del catálogo.
 * - `VARIOS`: varios bienes o personas con comunidades distintas: no hay UN valor del hecho; `valores` las enseña.
 * - `SIN_DATOS`: el catálogo no tiene ese impuesto, o no hay fila aplicable (ni la de `porDefecto`).
 */
export interface PlazoResuelto {
  impuesto: string;
  estado: 'RESUELTO' | 'SUPUESTO' | 'SIN_PLAZO_UNICO' | 'VARIOS' | 'SIN_DATOS';
  /** La comunidad del caso (antes de equivalencias) y la de la fila que se aplica. */
  ccaa: string | null;
  ccaaFila: string | null;
  fila: FilaPlazo | null;
  /** Por qué esa comunidad: el hecho mirado y la cita del tramo (Ley 22/2009, art. …). */
  conexion: { fact: string; cita: string } | null;
  aviso: string | null;
  valores?: string[];
}

const vacio = (v: unknown) => v === undefined || v === null || v === '';

/** El valor de un hecho en el caso: ACTO.X, u OBJETO.X / SUJETO.X de cada bien o persona (todos los distintos). */
function valoresDe(fact: string, caso: CasoPlazo): unknown[] {
  const [ambito, ...r] = fact.split('.');
  const nombre = r.join('.');
  if (ambito === 'ACTO') return vacio(caso.acto?.[nombre]) ? [] : [caso.acto![nombre]];
  const lista = ambito === 'OBJETO' ? caso.objetos ?? [] : ambito === 'SUJETO' ? caso.sujetos ?? [] : [];
  const vs = lista.map((x) => (nombre === 'TIPO' ? x.tipo : x.hechos[nombre])).filter((v) => !vacio(v));
  return [...new Set(vs.map((v) => JSON.stringify(v)))].map((s) => JSON.parse(s));
}

function cumple(c: CondicionPlazo, caso: CasoPlazo, esUn: (t: string, de: string) => boolean): boolean | null {
  const vs = valoresDe(c.fact, caso);
  if (c.op === 'EXISTS') return vs.length > 0;
  if (!vs.length) return null;
  const una = (v: unknown) => {
    switch (c.op) {
      case 'EQ': return v === c.valor;
      case 'NE': return v !== c.valor;
      case 'IN': return Array.isArray(c.valor) && c.valor.includes(v);
      case 'NOT_IN': return Array.isArray(c.valor) && !c.valor.includes(v);
      case 'ES_UN': return typeof v === 'string' && typeof c.valor === 'string' && esUn(v, c.valor);
      default: return false;
    }
  };
  return vs.some(una);
}

/** La fila vigente en `fecha` (la de `vigenteDesde` más reciente que no la supere). */
function filaVigente(filas: FilaPlazo[], impuesto: string, ccaa: string, fecha: string): FilaPlazo | null {
  return filas
    .filter((f) => f.impuesto === impuesto && f.ccaa === ccaa && (!f.vigenteDesde || String(f.vigenteDesde).slice(0, 10) <= fecha))
    .sort((a, b) => String(b.vigenteDesde ?? '').localeCompare(String(a.vigenteDesde ?? '')))[0] ?? null;
}

export function plazoDeImpuesto(
  impuesto: string,
  caso: CasoPlazo,
  tabla: TablaPlazos,
  opciones: {
    /** La comunidad de la notaría, con el código de los hechos de conexión (para `siNoConsta: NOTARIA`). */
    ccaaNotaria?: string | null;
    /** Fecha de referencia (devengo; por defecto hoy) para la vigencia de las filas. */
    fecha?: string;
    /** `ES_UN` en la jerarquía de tipos; sin ella, igualdad. */
    esUn?: (tipo: string, exigido: string) => boolean;
  } = {},
): PlazoResuelto {
  const imp = tabla.impuestos.find((i) => i.codigo === impuesto);
  const nada: PlazoResuelto = { impuesto, estado: 'SIN_DATOS', ccaa: null, ccaaFila: null, fila: null, conexion: null, aviso: null };
  if (!imp) return nada;
  const res: ResolucionPlazos = { ...(tabla.resolucion ?? {}), ...(imp.resolucion ?? {}) };
  const esUn = opciones.esUn ?? ((t, de) => t === de);
  const fecha = opciones.fecha ?? new Date().toISOString().slice(0, 10);

  // El tramo: el primero cuyas condiciones se cumplen. Una condición que no se puede evaluar (hecho sin valor) deja el
  // tramo en duda: no se salta al siguiente, porque el siguiente podría ser el equivocado (un inmueble tratado como mueble).
  let tramo: TramoConexion | null = null;
  for (const t of imp.puntoConexion) {
    const rs = (t.si ?? []).map((c) => cumple(c, caso, esUn));
    if (rs.some((r) => r === false)) continue;
    if (rs.some((r) => r === null)) break;
    tramo = t;
    break;
  }

  const aplicar = (ccaa: string, estado: PlazoResuelto['estado'], aviso: string | null): PlazoResuelto => {
    const destino = res.equivalencias?.[ccaa] ?? ccaa;
    const fila = filaVigente(tabla.plazos, impuesto, destino, fecha)
      ?? (res.porDefecto ? filaVigente(tabla.plazos, impuesto, res.porDefecto, fecha) : null);
    return {
      impuesto, estado: fila ? estado : 'SIN_DATOS', ccaa, ccaaFila: fila?.ccaa ?? null, fila,
      conexion: tramo ? { fact: tramo.ccaa, cita: tramo.cita } : null, aviso,
    };
  };

  const valores = tramo ? valoresDe(tramo.ccaa, caso).map(String) : [];
  if (valores.length > 1) return { ...nada, estado: 'VARIOS', conexion: tramo && { fact: tramo.ccaa, cita: tramo.cita }, valores };
  if (valores.length === 1) {
    const sin = res.sinPlazoUnico?.find((s) => s.valor === valores[0]);
    if (sin) return { ...nada, estado: 'SIN_PLAZO_UNICO', ccaa: valores[0], conexion: tramo && { fact: tramo.ccaa, cita: tramo.cita }, aviso: sin.aviso };
    return aplicar(valores[0], 'RESUELTO', null);
  }
  // El hecho no consta (o no se sabe qué tramo rige): lo que diga `siNoConsta`.
  const snc = res.siNoConsta;
  if (!snc) return nada;
  const supuesta = snc.ccaa === 'NOTARIA' ? opciones.ccaaNotaria ?? null : snc.ccaa;
  if (!supuesta) return { ...nada, aviso: snc.aviso.replace('{ccaa}', '—') };
  return aplicar(supuesta, 'SUPUESTO', snc.aviso.replace('{ccaa}', supuesta));
}
