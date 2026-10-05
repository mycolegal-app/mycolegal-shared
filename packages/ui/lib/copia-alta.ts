/**
 * #872 — Alta de una copia a notario custodio: la ÚNICA definición.
 *
 * La pedían dos formularios escritos por separado —el del Portal (gestoría,
 * banco, asesor) y el de Tramitación (la notaría)— y cada cambio en uno se
 * quedaba sin hacer en el otro: el «Tipo de copia» que en el Portal pasó a
 * llamarse «Subtipo» seguía con su nombre viejo en la notaría, junto a un
 * segundo «Subtipo» de texto libre que no era nada; faltaban la entidad de
 * origen, el concepto, la nota simple…
 *
 * Aquí viven las tres cosas que no pueden divergir: los valores (modos y
 * subtipos), las reglas de obligatoriedad y la forma del envío. El componente
 * `CopiaCustodioFields` los pinta; las dos pantallas lo usan. Sin React a
 * propósito: el servidor puede importar las reglas.
 */
import { esNifValido } from './nif';

/** #340 — Modo de solicitud: capa de UI sobre el par (tipoDocumento, tipoCopia). */
export const COPIA_MODOS = ['COPIA_ESCRITURA', 'TESTIMONIO_POLIZA', 'CEE'] as const;
export type CopiaModo = (typeof COPIA_MODOS)[number];

export const COPIA_SUBTIPOS_POR_MODO: Record<string, string[]> = {
  COPIA_ESCRITURA: [
    'AUTENTICA_COMPLETA_EJECUTIVA',
    'AUTENTICA_PARCIAL_EJECUTIVA',
    'AUTENTICA_COMPLETA_INFORMATIVA',
    'AUTENTICA_PARCIAL_INFORMATIVA',
    'SIMPLE',
  ],
  TESTIMONIO_POLIZA: ['TESTIMONIO_EJECUTIVO', 'TESTIMONIO_INFORMATIVO'],
};

/** (documento, tipoCopia) inicial al entrar en cada modo. */
export const COPIA_MODO_DEFAULT: Record<string, { doc: string; tipo: string }> = {
  COPIA_ESCRITURA: { doc: 'ESCRITURA', tipo: 'AUTENTICA_COMPLETA_EJECUTIVA' },
  TESTIMONIO_POLIZA: { doc: 'POLIZA', tipo: 'TESTIMONIO_EJECUTIVO' },
  CEE: { doc: 'ESCRITURA', tipo: 'TITULO_EJECUTIVO_EUROPEO' },
};

/** #23 — Entidad de origen: gobierna el párrafo de doctrina DGRN del oficio (#453). */
export const ENTIDAD_ORIGEN_SABADELL = 'Banco de Sabadell, S.A.';
export const ENTIDAD_ORIGEN_OTRA = 'Otra';

/** Lo que el solicitante teclea en el bloque «Datos de la copia». */
export interface CopiaAltaValues {
  modo: string;
  tipoDocumento: string;
  tipoCopia: string;
  parteParcial: string;
  notarioAutorizante: string;
  notarioAutorizanteId: string | null;
  protocoloAsiento: string;
  fechaProtocolo: string;
  referenciaPropia: string;
  concepto: string;
  entidadOrigen: string;
  sedasOficina: string;
  sedasExpediente: string;
  sedasAutos: string;
  gcr: string;
  codigoServicio: string;
  titularOriginal: string;
  titularOriginalNif: string;
}

export function copiaAltaInicial(): CopiaAltaValues {
  const def = COPIA_MODO_DEFAULT.COPIA_ESCRITURA;
  return {
    modo: 'COPIA_ESCRITURA',
    tipoDocumento: def.doc,
    tipoCopia: def.tipo,
    parteParcial: '',
    notarioAutorizante: '',
    notarioAutorizanteId: null,
    protocoloAsiento: '',
    fechaProtocolo: '',
    referenciaPropia: '',
    concepto: '',
    entidadOrigen: '',
    sedasOficina: '',
    sedasExpediente: '',
    sedasAutos: '',
    gcr: '',
    codigoServicio: '',
    titularOriginal: '',
    titularOriginalNif: '',
  };
}

/** Cambiar de modo arrastra su (documento, tipoCopia) por defecto. */
export function conModo(v: CopiaAltaValues, modo: string): CopiaAltaValues {
  const def = COPIA_MODO_DEFAULT[modo] ?? COPIA_MODO_DEFAULT.COPIA_ESCRITURA;
  return { ...v, modo, tipoDocumento: def.doc, tipoCopia: def.tipo };
}

/** #840 — Solo las auténticas PARCIALES piden (y exigen) el contenido. */
export function esCopiaParcial(v: Pick<CopiaAltaValues, 'tipoCopia'>): boolean {
  return v.tipoCopia.includes('PARCIAL');
}

/** #7 — En escritura la nota simple es obligatoria; en póliza, opcional. */
export function adjuntoObligatorioCopia(v: Pick<CopiaAltaValues, 'tipoDocumento'>): boolean {
  return v.tipoDocumento === 'ESCRITURA';
}

export interface CopiaAltaContexto {
  /**
   * #835 — ¿Se piden las referencias internas de la entidad (SEDAS, GCR, su código
   * de servicio)? Solo cuando se pide por cuenta del banco (atributo del
   * departamento) o lo da de alta la propia notaría.
   */
  refsEntidadVisibles: boolean;
  /** Ficheros adjuntados (solo se cuenta). `null` = esta pantalla no gestiona adjuntos. */
  numAdjuntos: number | null;
}

/**
 * Primera regla incumplida, como clave i18n (`copiaCustodio.*`), o `null`.
 * Mismo orden en que el Portal avisaba hasta ahora.
 */
export function primerErrorCopiaAlta(v: CopiaAltaValues, ctx: CopiaAltaContexto): string | null {
  if (!v.notarioAutorizante.trim()) return 'copiaCustodio.notarioRequerido';
  if (!v.entidadOrigen) return 'copiaCustodio.entidadOrigenRequerida';
  // #835 — Sin las referencias de la entidad a la vista, el SEDAS no es alternativa.
  if (!v.referenciaPropia.trim() && !ctx.refsEntidadVisibles) return 'copiaCustodio.referenciaPropiaRequerida';
  if (!v.referenciaPropia.trim() && !v.sedasExpediente.trim()) return 'copiaCustodio.referenciaRequerida';
  if (!v.protocoloAsiento.trim() && !v.titularOriginal.trim()) return 'copiaCustodio.titularRequerido';
  // #873 — vacío no se exige; si se escribe, tiene que cuadrar su letra de control.
  if (v.titularOriginalNif.trim() && !esNifValido(v.titularOriginalNif)) return 'copiaCustodio.titularNifInvalido';
  if (ctx.numAdjuntos !== null && adjuntoObligatorioCopia(v) && ctx.numAdjuntos === 0) {
    return 'copiaCustodio.adjuntoRequerido';
  }
  if (esCopiaParcial(v) && !v.parteParcial.trim()) return 'copiaCustodio.parteParcialRequerida';
  return null;
}

/** Los campos de la copia tal y como viajan (Portal → Tramitación, o al `crear` interno). */
export function copiaAltaPayload(v: CopiaAltaValues, ctx: Pick<CopiaAltaContexto, 'refsEntidadVisibles'>) {
  const refs = ctx.refsEntidadVisibles;
  const s = (x: string) => x.trim() || null;
  return {
    tipoDocumento: v.tipoDocumento,
    tipoCopia: v.tipoCopia,
    // #840 — solo en las parciales.
    parteParcial: esCopiaParcial(v) ? v.parteParcial.trim() : null,
    concepto: s(v.concepto),
    entidadOrigen: v.entidadOrigen || null,
    notarioAutorizante: v.notarioAutorizante.trim(),
    notarioAutorizanteId: v.notarioAutorizanteId,
    referenciaPropia: s(v.referenciaPropia),
    protocoloAsiento: s(v.protocoloAsiento),
    fechaProtocolo: v.fechaProtocolo || null,
    titularOriginal: s(v.titularOriginal),
    titularOriginalNif: s(v.titularOriginalNif),
    // #835 — ocultas = nulas, aunque se tecleara algo antes de ocultarlas.
    sedasOficina: refs ? s(v.sedasOficina) : null,
    sedasExpediente: refs ? s(v.sedasExpediente) : null,
    sedasAutos: refs ? s(v.sedasAutos) : null,
    gcr: refs ? s(v.gcr) : null,
    codigoServicio: refs ? s(v.codigoServicio) : null,
  };
}
