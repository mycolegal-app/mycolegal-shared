// EL EVALUADOR DE REQUISITOS POR IA — F2 de PLAN_TECNICO_EVALUACION_REQUISITOS_IA.
//
// Encargo de Carles (8-oct-2026): todos los requisitos que devuelve el motor se evalúan
// con la información del caso (documentos, chat), y se reevalúan cuando llega más.
//
// MANDA EL MOTOR (D1). La IA no decide si un requisito aplica: busca en las fuentes los
// DATOS que le faltan al motor y el motor vuelve a decidir con ellos. Lo que sí dice la IA
// es si cada requisito que aplica (o puede aplicar) está CUMPLIDO, con su prueba.
//
// NO SABE DE NINGÚN PROVEEDOR. Igual que el motor no sabe de Prisma (D30), esto recibe una
// función `llm(sistema, mensaje) → texto`. Cada app le pasa la suya, con el modelo y el
// prompt que gobierna Admin.
//
// SIN CITA NO HAY DATO. Cada dato y cada prueba traen una cita literal que se comprueba
// aquí contra el texto de la fuente. La que no aparece se tira, y un «cumplido» sin prueba
// comprobada baja a «no se sabe». Es el mismo criterio que la extracción de Redactor: el
// modelo puede tener un mal día, y el filtro no.
import { NO_APLICA, FACT_TIPO_OBJETO, FACT_TIPO_SUJETO, type Hechos, type Resultado, type RequisitoResuelto } from './motor';

export type ModoEvaluacion = 'REVISION' | 'PREPARACION';

/** Una fuente del caso: la escritura, un antecedente, un adjunto, las respuestas, el chat. */
export interface FuenteCaso {
  /** `F1`, `F2`…: lo que el modelo cita. Lo asigna `numerarFuentes`. */
  id: string;
  nombre: string;
  texto: string;
}

export interface ContextoEvaluacion {
  modo: ModoEvaluacion;
  acto: { codigo: string; nombre: string };
  ccaa?: string | null;
  fuentes: FuenteCaso[];
}

/** Un requisito tal como se le enseña al modelo. Lo compone la app: sabe del catálogo de
 *  tipos de documento (clase, nombre corto) lo que el motor no. */
export interface RequisitoAEvaluar {
  codigo: string;
  situacion: 'APLICA' | 'PUEDE_APLICAR';
  /** Nombre corto: el del documento, o el de la regla si no es documental. */
  titulo: string;
  /** `DOCUMENTO`, `MANIFESTACION`, `ACTUACION`, `CONSULTA`, `COMPARECENCIA`. */
  clase: string;
  aporta: 'CLIENTE' | 'NOTARIA' | null;
  tratamiento: string | null;
  obligatorio: boolean;
  exige: string | null;
  condicionesTexto: string[];
  fundamento: string[];
}

export type Confianza = 'alta' | 'media' | 'baja';
export type Veredicto = 'SI' | 'NO' | 'NS';

export interface DatoLeido {
  /** El identificador exacto del dato: `SUJETO.ESTADO_CIVIL`, `ACTO.CAUSA`, `OBJETO.TIPO`… */
  dato: string;
  valor: unknown;
  /** De qué interviniente, por su rol, si es un dato de SUJETO. */
  rol: string | null;
  fuente: string;
  cita: string;
  confianza: Confianza;
}

export interface Prueba { fuente: string; cita: string }

export interface EvaluacionRequisito {
  codigo: string;
  cumplido: Veredicto;
  evidencia: Prueba[];
  /** Qué falta para cumplirlo, en pocas palabras. */
  falta: string | null;
  datos: DatoLeido[];
  /** Citas que el modelo dio y NO están en la fuente: se tiran y se cuentan. */
  citasDescartadas: number;
  /** Huella de lo que vio (requisito + fuentes): si no cambia, no se vuelve a preguntar. */
  huella: string;
}

export type Llm = (sistema: string, mensaje: string) => Promise<string>;

// ── el prompt ────────────────────────────────────────────────────────────────

/** Instrucciones de sistema por defecto (clave `requisitos.evaluar`; Admin puede sustituirlas). */
export const PROMPT_EVALUAR_REQUISITOS = `Eres un oficial de notaría español que comprueba los requisitos de una escritura.
Recibes FUENTES numeradas (F1, F2…) y una lista de REQUISITOS de un catálogo jurídico.
Un motor de reglas ya ha decidido qué requisitos aplican; tú NO decides si un requisito
aplica. Tu trabajo es doble:

1. DATOS. Para cada requisito que «PUEDE APLICAR», busca en las fuentes los datos de sus
   condiciones (el identificador va entre corchetes) y devuélvelos con ese identificador
   exacto. Cada dato: valor, interviniente (rol) si es de un interviniente, fuente y CITA
   LITERAL. Para un dato SÍ/NO usa los valores SI o NO; para una lista, uno de sus valores.
2. CUMPLIMIENTO. Para cada requisito (aplique seguro o pueda aplicar) di si está CUMPLIDO
   según el modo de trabajo:
   - REVISION: la escritura (la fuente marcada ESCRITURA) ya lo satisface o deja constancia.
   - PREPARACION: con lo aportado y dicho, se puede satisfacer al otorgar.
   Responde SI, NO o NS (no se sabe), con su evidencia, o con lo que falta.

Reglas que no se rompen:
- Solo vale lo que está en las fuentes. Sin cita literal, no hay dato: NS.
- Copia la cita tal cual, máximo 200 caracteres, de UNA sola fuente.
- Un dato que no existe para un interviniente (régimen de un soltero, estado civil de
  una sociedad) NO es desconocido: devuélvelo con valor "NO_APLICA".
- El representante no es parte del negocio: sus datos personales no cuentan como los
  del vendedor o el comprador.
- Lo dicho por el operador o en la conversación prevalece sobre un documento.
- Si dudas, NS. Un NO o un SI equivocados son peores que un NS.
- Responde SOLO con el JSON pedido, sin texto alrededor.

Formato de respuesta:
{"evaluaciones": [{"codigo": "...", "datos": [{"dato": "...", "valor": "...", "rol": null,
  "fuente": "F1", "cita": "...", "confianza": "alta|media|baja"}], "cumplido": "SI|NO|NS",
  "evidencia": [{"fuente": "F1", "cita": "..."}], "falta": "..." }]}`;

const CLASE_TEXTO: Record<string, string> = {
  DOCUMENTO: 'DOCUMENTO', MANIFESTACION: 'MANIFESTACIÓN', ACTUACION: 'ACTUACIÓN de la notaría',
  CONSULTA: 'CONSULTA de la notaría', COMPARECENCIA: 'COMPARECENCIA',
};

/** Las fuentes, primero y siempre iguales en todos los lotes: así el proveedor reutiliza el
 *  prefijo en caché y cada lote sólo paga su lista de requisitos. */
export function cabeceraDelMensaje(ctx: ContextoEvaluacion): string {
  const partes = [
    `MODO: ${ctx.modo}`,
    `ACTO: ${ctx.acto.codigo} · ${ctx.acto.nombre}${ctx.ccaa ? ` · ${ctx.ccaa}` : ''}`,
    '',
    '## FUENTES',
  ];
  if (ctx.fuentes.length === 0) partes.push('', '(No hay ninguna fuente: todo es NS.)');
  for (const f of ctx.fuentes) partes.push('', `### ${f.id} — ${f.nombre}`, f.texto.trim() || '(sin texto legible)');
  return partes.join('\n');
}

export function loteDelMensaje(reqs: RequisitoAEvaluar[], n: number, de: number): string {
  const partes = ['', `## REQUISITOS (lote ${n} de ${de})`];
  for (const r of reqs) {
    const clase = [
      CLASE_TEXTO[r.clase] ?? r.clase,
      r.aporta ? `lo aporta ${r.aporta === 'CLIENTE' ? 'el CLIENTE' : 'la NOTARÍA'}` : null,
      r.tratamiento,
      r.obligatorio ? 'obligatorio' : 'recomendado',
    ].filter(Boolean).join(' · ');
    const motor = r.situacion === 'APLICA'
      ? 'APLICA'
      : `PUEDE APLICAR — aplica si: ${r.condicionesTexto.join('; y además ') || '(condición no expresada)'}`;
    partes.push('', `[${r.codigo}] ${r.titulo}`, `  Clase: ${clase}`, `  Motor: ${motor}`);
    if (r.exige) partes.push(`  Exige: ${r.exige}`);
    if (r.fundamento.length) partes.push(`  Fundamento: ${r.fundamento.join('; ')}`);
  }
  return partes.join('\n');
}

// ── la respuesta ─────────────────────────────────────────────────────────────

/** Para comparar una cita con su fuente: sin mayúsculas, acentos, comillas ni espacios dobles. */
export function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[«»"“”'‘’`]/g, '').replace(/\s+/g, ' ').trim();
}

/** ¿Está la cita, literal, en la fuente? Basta un tramo de 25 caracteres seguidos si es
 *  larga: el modelo a veces recorta por el medio con «…». */
export function citaEnFuente(cita: string, fuente: string): boolean {
  const c = normalizarTexto(cita);
  if (c.length < 3) return false;
  const f = normalizarTexto(fuente);
  if (f.includes(c)) return true;
  const trozos = c.split(/\s*(?:\.\.\.|…)\s*/).filter((x) => x.length >= 25);
  return trozos.length > 0 && trozos.every((t) => f.includes(t));
}

function valorDe(v: unknown): unknown {
  if (v === 'SI' || v === 'SÍ' || v === true) return true;
  if (v === 'NO' || v === false) return false;
  return v;
}

const VEREDICTOS = new Set<Veredicto>(['SI', 'NO', 'NS']);
const CONFIANZAS = new Set<Confianza>(['alta', 'media', 'baja']);

/**
 * Lo que devolvió el modelo, filtrado: códigos del lote, veredictos y confianzas válidos,
 * y sólo las citas que están de verdad en su fuente.
 */
export function normalizarRespuesta(
  texto: string,
  lote: RequisitoAEvaluar[],
  fuentes: FuenteCaso[],
  huellaDe: (r: RequisitoAEvaluar) => string,
): EvaluacionRequisito[] {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let crudo: unknown;
  try { crudo = JSON.parse(limpio); } catch { return []; }
  const lista = Array.isArray((crudo as { evaluaciones?: unknown })?.evaluaciones)
    ? (crudo as { evaluaciones: unknown[] }).evaluaciones : [];
  const enLote = new Map(lote.map((r) => [r.codigo, r]));
  const textoDe = new Map(fuentes.map((f) => [f.id, f.texto]));
  const out: EvaluacionRequisito[] = [];
  for (const e of lista as Record<string, unknown>[]) {
    const req = enLote.get(String(e?.codigo ?? ''));
    if (!req || out.some((x) => x.codigo === req.codigo)) continue;
    let descartadas = 0;
    const verificada = (fuente: unknown, cita: unknown): Prueba | null => {
      const f = String(fuente ?? ''); const c = String(cita ?? '').slice(0, 400);
      const t = textoDe.get(f);
      if (t !== undefined && citaEnFuente(c, t)) return { fuente: f, cita: c };
      descartadas++;
      return null;
    };
    const datos: DatoLeido[] = [];
    for (const d of (Array.isArray(e.datos) ? e.datos : []) as Record<string, unknown>[]) {
      const dato = String(d?.dato ?? '');
      if (!/^(ACTO|SUJETO|OBJETO)\.[A-Z0-9_]+$/.test(dato)) continue;
      const p = verificada(d.fuente, d.cita);
      if (!p) continue;
      const confianza = CONFIANZAS.has(d.confianza as Confianza) ? d.confianza as Confianza : 'baja';
      datos.push({ dato, valor: valorDe(d.valor), rol: d.rol ? String(d.rol) : null, fuente: p.fuente, cita: p.cita, confianza });
    }
    const evidencia = ((Array.isArray(e.evidencia) ? e.evidencia : []) as Record<string, unknown>[])
      .map((x) => verificada(x?.fuente, x?.cita)).filter((x): x is Prueba => x !== null);
    let cumplido: Veredicto = VEREDICTOS.has(e.cumplido as Veredicto) ? e.cumplido as Veredicto : 'NS';
    // Un «cumplido» sin prueba comprobada no vale: baja a «no se sabe».
    if (cumplido === 'SI' && evidencia.length === 0) cumplido = 'NS';
    out.push({
      codigo: req.codigo, cumplido, evidencia,
      falta: e.falta ? String(e.falta).slice(0, 300) : null,
      datos, citasDescartadas: descartadas, huella: huellaDe(req),
    });
  }
  return out;
}

// ── huellas ──────────────────────────────────────────────────────────────────

/** FNV-1a de 32 bits: no es criptográfica ni falta que haga; sólo dice «esto cambió». */
export function huellaTexto(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function huellaContexto(ctx: ContextoEvaluacion): string {
  return huellaTexto([ctx.modo, ctx.acto.codigo, ctx.ccaa ?? '', ...ctx.fuentes.map((f) => `${f.id}\u0001${f.nombre}\u0001${f.texto}`)].join('\u0002'));
}

function huellaRequisito(r: RequisitoAEvaluar, hCtx: string): string {
  return huellaTexto([hCtx, r.codigo, r.situacion, ...r.condicionesTexto].join('\u0001'));
}

// ── evaluación ───────────────────────────────────────────────────────────────

/** Numera las fuentes F1, F2… en el orden dado. */
export function numerarFuentes(fuentes: Omit<FuenteCaso, 'id'>[]): FuenteCaso[] {
  return fuentes.map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

export interface OpcionesEvaluacion {
  llm: Llm;
  /** Instrucciones de sistema; por defecto `PROMPT_EVALUAR_REQUISITOS`. */
  sistema?: string;
  /** Requisitos por llamada. */
  lote?: number;
  /** Llamadas a la vez. */
  paralelo?: number;
  /** Evaluaciones anteriores: las de huella igual se reutilizan sin llamar al modelo. */
  previas?: EvaluacionRequisito[];
}

/** Evalúa una lista de requisitos contra el contexto. Nunca lanza: un lote que falla se
 *  cuenta en `errores` y sus requisitos quedan sin evaluación. */
export async function evaluarRequisitos(
  reqs: RequisitoAEvaluar[],
  ctx: ContextoEvaluacion,
  op: OpcionesEvaluacion,
): Promise<{ evaluaciones: EvaluacionRequisito[]; errores: string[]; llamadas: number; reutilizadas: number }> {
  const hCtx = huellaContexto(ctx);
  const huellaDe = (r: RequisitoAEvaluar) => huellaRequisito(r, hCtx);
  const previa = new Map((op.previas ?? []).map((e) => [e.codigo, e]));
  const reutilizadas: EvaluacionRequisito[] = [];
  const pendientes: RequisitoAEvaluar[] = [];
  for (const r of reqs) {
    const p = previa.get(r.codigo);
    if (p && p.huella === huellaDe(r)) reutilizadas.push(p);
    else pendientes.push(r);
  }
  const tam = Math.max(1, op.lote ?? 25);
  const lotes: RequisitoAEvaluar[][] = [];
  for (let i = 0; i < pendientes.length; i += tam) lotes.push(pendientes.slice(i, i + tam));
  const cabecera = cabeceraDelMensaje(ctx);
  const sistema = op.sistema ?? PROMPT_EVALUAR_REQUISITOS;
  const evaluaciones: EvaluacionRequisito[] = [...reutilizadas];
  const errores: string[] = [];
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lotes.length) {
      const i = siguiente++;
      try {
        const texto = await op.llm(sistema, cabecera + '\n' + loteDelMensaje(lotes[i], i + 1, lotes.length));
        evaluaciones.push(...normalizarRespuesta(texto, lotes[i], ctx.fuentes, huellaDe));
      } catch (err) {
        errores.push(`lote ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, op.paralelo ?? 3), lotes.length) }, trabajador));
  return { evaluaciones, errores, llamadas: lotes.length, reutilizadas: reutilizadas.length };
}

/**
 * Los datos que leyó la IA, añadidos a los hechos del caso. **Nunca pisan** un dato ya
 * conocido: lo que dijo una persona manda. Los de confianza baja no entran. Un dato de
 * SUJETO va al interviniente con ese rol (o a uno nuevo con ese rol, si no lo hay).
 */
export function anadirDatos(hechos: Hechos, datos: DatoLeido[]): Hechos {
  const out: Hechos = {
    acto: { ...(hechos.acto ?? {}) },
    sujetos: (hechos.sujetos ?? []).map((s) => ({ ...s, hechos: { ...s.hechos } })),
    objetos: (hechos.objetos ?? []).map((o) => ({ ...o, hechos: { ...o.hechos } })),
  };
  for (const d of datos) {
    if (d.confianza === 'baja') continue;
    const [ambito, ...resto] = d.dato.split('.');
    const nombre = resto.join('.');
    if (ambito === 'ACTO') {
      if (out.acto![nombre] === undefined) out.acto![nombre] = d.valor;
    } else if (ambito === 'SUJETO') {
      let s = out.sujetos!.find((x) => (x.rol ?? null) === d.rol);
      if (!s) { s = { id: `IA-${d.rol ?? out.sujetos!.length + 1}`, rol: d.rol, tipo: null, hechos: {} }; out.sujetos!.push(s); }
      if (d.dato === FACT_TIPO_SUJETO) { if (!s.tipo && typeof d.valor === 'string' && d.valor !== NO_APLICA) s.tipo = d.valor; }
      else if (s.hechos[nombre] === undefined) s.hechos[nombre] = d.valor;
    } else if (ambito === 'OBJETO') {
      let o = out.objetos![0];
      if (!o) { o = { id: 'IA-BIEN', tipo: null, hechos: {} }; out.objetos!.push(o); }
      if (d.dato === FACT_TIPO_OBJETO) { if (!o.tipo && typeof d.valor === 'string' && d.valor !== NO_APLICA) o.tipo = d.valor; }
      else if (o.hechos[nombre] === undefined) o.hechos[nombre] = d.valor;
    }
  }
  return out;
}

export interface EvaluacionDelCaso {
  /** El resultado del motor DESPUÉS de los datos leídos: es el que manda. */
  resultado: Resultado;
  hechos: Hechos;
  evaluaciones: EvaluacionRequisito[];
  errores: string[];
  llamadas: number;
  reutilizadas: number;
  huella: string;
}

/**
 * El ciclo entero: motor → IA (datos y cumplimiento) → motor con los datos → IA sobre lo que
 * haya pasado a aplicar sin evaluar. Dos vueltas como mucho. Los descartados no se evalúan:
 * ahí manda el motor (D1).
 */
export async function evaluarCaso(args: {
  hechos: Hechos;
  resolver: (h: Hechos) => Promise<Resultado>;
  /** Cómo se enseña cada requisito al modelo: la app añade clase, nombre y quién aporta. */
  describir: (r: RequisitoResuelto, situacion: RequisitoAEvaluar['situacion']) => RequisitoAEvaluar;
  contexto: ContextoEvaluacion;
} & OpcionesEvaluacion): Promise<EvaluacionDelCaso> {
  const aEvaluar = (r: Resultado) => [
    ...r.firmes.map((x) => args.describir(x, 'APLICA')),
    ...r.condicionados.map((x) => args.describir(x, 'PUEDE_APLICAR')),
  ];
  let hechos = args.hechos;
  let resultado = await args.resolver(hechos);
  const primera = await evaluarRequisitos(aEvaluar(resultado), args.contexto, args);
  const evaluadas = new Map(primera.evaluaciones.map((e) => [e.codigo, e]));
  const errores = [...primera.errores];
  let llamadas = primera.llamadas;
  let reutilizadas = primera.reutilizadas;

  const datos = primera.evaluaciones.flatMap((e) => e.datos);
  if (datos.length) {
    hechos = anadirDatos(hechos, datos);
    resultado = await args.resolver(hechos);
    // Segunda vuelta: lo que ahora aplica o puede aplicar y no se evaluó, o cuya situación
    // cambió (de «puede aplicar» a «aplica» cambia su huella).
    const nuevos = aEvaluar(resultado).filter((r) => !evaluadas.has(r.codigo)
      || evaluadas.get(r.codigo)!.huella !== huellaRequisito(r, huellaContexto(args.contexto)));
    if (nuevos.length) {
      const segunda = await evaluarRequisitos(nuevos, args.contexto, { ...args, previas: [] });
      for (const e of segunda.evaluaciones) evaluadas.set(e.codigo, e);
      errores.push(...segunda.errores);
      llamadas += segunda.llamadas;
      reutilizadas += segunda.reutilizadas;
    }
  }
  // Sólo las de requisitos que siguen vivos: un descartado no tiene cumplimiento.
  const vivos = new Set([...resultado.firmes, ...resultado.condicionados].map((r) => r.codigo));
  return {
    resultado, hechos,
    evaluaciones: [...evaluadas.values()].filter((e) => vivos.has(e.codigo)),
    errores, llamadas, reutilizadas, huella: huellaContexto(args.contexto),
  };
}
