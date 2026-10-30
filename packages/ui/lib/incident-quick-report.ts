// #1011 — Reporte a soporte «de un clic», sin abrir el modal del reporter.
//
// Quien sabe a qué app pertenece un reporte y adónde enviarlo es el
// `IncidentReporter` (lo monta cada app en su layout con su `appSlug` y su
// `submitUrl`, que proxya a `POST /incidents` de mycolegal-auth). Un componente
// compartido suelto (p. ej. el NotarioPicker) no conoce ninguna de las dos
// cosas, así que no hace el POST él: dispara este evento y el reporter, si está
// montado, lo envía con su app y devuelve la promesa del envío en el propio
// `detail` (dispatchEvent es síncrono, así que el emisor la tiene al volver).
//
// Si no hay reporter montado nadie marca `handled` y `enviarReporteDirecto`
// rechaza con `SinReporterError`: el emisor decide qué hacer (p. ej. no ofrecer
// el botón).

export const EVENTO_REPORTE_DIRECTO = "mycolegal:send-incident-report";

export type TipoReporteDirecto = "incident" | "improvement";

export interface ReporteDirecto {
  kind: TipoReporteDirecto;
  /** Texto de la incidencia tal cual lo leerá soporte. */
  description: string;
  /** Datos estructurados; viajan en `metadata.context`. */
  extra?: Record<string, unknown>;
}

export interface ReporteDirectoDetail extends ReporteDirecto {
  /** Lo pone a true el reporter que atiende el evento. */
  handled?: boolean;
  /** Promesa del envío, la pone el reporter al atenderlo. */
  result?: Promise<void>;
}

export class SinReporterError extends Error {
  constructor() {
    super("No hay IncidentReporter montado que atienda el reporte");
    this.name = "SinReporterError";
  }
}

/** Envía un reporte a soporte a través del `IncidentReporter` montado. */
export function enviarReporteDirecto(reporte: ReporteDirecto): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new SinReporterError());
  const detail: ReporteDirectoDetail = { ...reporte };
  window.dispatchEvent(new CustomEvent<ReporteDirectoDetail>(EVENTO_REPORTE_DIRECTO, { detail }));
  if (!detail.handled || !detail.result) return Promise.reject(new SinReporterError());
  return detail.result;
}
