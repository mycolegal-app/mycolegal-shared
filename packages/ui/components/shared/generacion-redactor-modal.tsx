"use client";

// EL MODAL DE GENERACIÓN EN LA APP DE ORIGEN (DR21 de mycolegal-redactor/PLAN_TECNICO_REDACTOR_UI).
//
// Notaría, LegiFirma y Pólizas piden un documento a Redactor sin salir de su pantalla: al pulsar
// «Generar», este modal ENCARGA el trabajo (`POST {apiBase}/tareas`), enseña los pasos que va dando
// Redactor consultando su estado, pregunta lo que falte y acaba en la VISTA PREVIA del documento,
// con la cinta «Powered by DocFilling» y tres acciones: Incorporar, Descargar e Imprimir.
//
// UNO SOLO PARA LAS TRES APPS: lo único que cambia de una a otra es dónde se incorpora el documento
// (`incorporarEn`). La app sólo expone su ruta estrecha `{apiBase}/tareas/…` → `/api/inter/tareas/…`
// de Redactor (`forwardRedactor` de sharedlib), porque la clave de servicio no puede ir al navegador.
//
// LOS CUATRO ESTADOS, que se suceden dentro del mismo modal:
//   · trabajando — los pasos de Redactor, con el que está en curso girando.
//   · preguntas  — lo que falta: la firma, si no se sabe quién firma, y los datos y condiciones con
//                  el mismo recorrido de huecos que el `EscrituraModal` (orden y frontera los decide
//                  el servidor). Cada respuesta puede cerrar el documento o volver a generarlo.
//   · listo      — la vista previa y las acciones.
//   · error      — qué ha pasado, en palabras, y «Reintentar».
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, Printer, Link2, RotateCcw, X, AlertTriangle, Circle } from "lucide-react";
import { DocFillingCinta } from "../brand/docfilling-cinta";
import { Button } from "../ui/button";
import { AlertBanner } from "./alert-banner";
import { useI18n } from "../i18n/i18n-context";
import { Escritura, type PrevisualizacionEscritura } from "./escritura-modal";
import { Markdown } from "./markdown";

/** Lo que la app sabe y le pasa a Redactor (DR16): la entidad, el `.md` de partida y sus documentos. */
export interface EncargoRedactor {
  entidad: { app: string; tipo: string; id: string; etiqueta?: string | null };
  /** `.md` con cabecera YAML opcional (`acto`, `esquema`, `idioma`, `hechos`, `campos`; DR17). */
  contextoMd: string;
  adjuntos?: { nodeId: string; requisito?: string | null }[];
}

/** Dónde cuelga «Incorporar» el enlace al documento, en la Unidad de Red de la app de origen. */
export interface DestinoIncorporar {
  app: string;
  carpeta?: string[];
  entidad: { tipo: string; id: string; etiqueta?: string | null };
  nombre?: string;
}

interface PasoEncargo { id: string; texto: string; estado: "en_curso" | "hecho" | "aviso" | "error"; at: string }
interface VistaEncargo {
  tareaId: string;
  referencia: string | null;
  nombre: string;
  esquema: string | null;
  estadoTarea: string;
  generadoAt: string | null;
  docxNodeId: string | null;
  encargo: {
    estado: "trabajando" | "preguntas" | "listo" | "error";
    pasos: PasoEncargo[];
    error?: { code: string; message: string } | null;
    firma?: { opciones: string[] } | null;
    incorporado?: { nodeId: string; at: string } | null;
  } | null;
}

export interface GeneracionRedactorModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** La ruta estrecha de la app hacia Redactor. */
  apiBase?: string;
  /** Encargo nuevo (o repetido: Redactor reutiliza la tarea de la misma entidad y acto). */
  encargo?: EncargoRedactor;
  /** Reabrir una tarea ya encargada (la lista de documentos de la entidad, F11.5). */
  tareaId?: string;
  titulo?: string;
  /** Sin destino no se ofrece «Incorporar». */
  incorporarEn?: DestinoIncorporar;
  /** Tras incorporar, para que la app refresque lo suyo. */
  onIncorporado?: (r: { tareaId: string; nodeId: string }) => void;
  /** Cuando cambia algo que la app enseña (una tarea nueva, un documento generado). */
  onCambio?: () => void;
}

/** Cada cuánto se pregunta el estado mientras Redactor trabaja. */
const INTERVALO_MS = 2500;

export function GeneracionRedactorModal({
  abierto, onCerrar, apiBase = "/api/redactor", encargo, tareaId: tareaInicial, titulo,
  incorporarEn, onIncorporado, onCambio,
}: GeneracionRedactorModalProps) {
  const { t } = useI18n();
  const [tareaId, setTareaId] = useState<string | null>(tareaInicial ?? null);
  const [vista, setVista] = useState<VistaEncargo | null>(null);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [prev, setPrev] = useState<PrevisualizacionEscritura | null>(null);
  const [actual, setActual] = useState(0);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [incorporando, setIncorporando] = useState(false);
  const pedido = useRef(false);
  const cuerpoRef = useRef<HTMLDivElement>(null);

  // ── encargar al abrir ────────────────────────────────────────────────────────
  const encargar = useCallback(async () => {
    if (!encargo) return;
    setErrorCrear(null);
    const r = await fetch(`${apiBase}/tareas`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(encargo),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j?.data?.tareaId) {
      const code = j?.error?.code as string | undefined;
      setErrorCrear(code === "PACK_NO_CONTRATADO" ? t("ui.generacionRedactor.sinPaquete")
        : code === "ESQUEMA_NO_EXISTE" ? t("ui.generacionRedactor.sinEsquema")
          : t("ui.generacionRedactor.noDisponible"));
      return;
    }
    setTareaId(j.data.tareaId);
    setVista(null);
    setPrev(null);
    onCambio?.();
  }, [apiBase, encargo, onCambio, t]);

  useEffect(() => {
    if (!abierto) { pedido.current = false; return; }
    if (tareaInicial) { setTareaId(tareaInicial); return; }
    if (!pedido.current) { pedido.current = true; void encargar(); }
  }, [abierto, tareaInicial, encargar]);

  // ── seguir el trabajo ────────────────────────────────────────────────────────
  const leerEstado = useCallback(async () => {
    if (!tareaId) return null;
    const r = await fetch(`${apiBase}/tareas/${tareaId}`).catch(() => null);
    if (!r?.ok) return null;
    const v = (await r.json()).data as VistaEncargo;
    setVista(v);
    return v;
  }, [apiBase, tareaId]);

  const estado = vista?.encargo?.estado ?? (tareaId ? "trabajando" : null);

  useEffect(() => {
    if (!abierto || !tareaId) return;
    void leerEstado();
    if (estado !== "trabajando") return;
    const h = setInterval(() => { void leerEstado(); }, INTERVALO_MS);
    return () => clearInterval(h);
  }, [abierto, tareaId, estado, leerEstado]);

  // La vista previa: para preguntar (huecos) y para enseñar el resultado.
  const cargarPrev = useCallback(async () => {
    if (!tareaId) return;
    const r = await fetch(`${apiBase}/tareas/${tareaId}/previsualizar`).catch(() => null);
    if (r?.ok) setPrev((await r.json()).data as PrevisualizacionEscritura);
  }, [apiBase, tareaId]);

  useEffect(() => {
    if (!abierto) return;
    if (estado === "listo") { void cargarPrev(); onCambio?.(); }
    if (estado === "preguntas" && !vista?.encargo?.firma) { void cargarPrev(); setActual(0); }
    // `onCambio` y `vista` fuera a propósito: sólo al CAMBIAR de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, estado, cargarPrev]);

  // Escape cierra: un modal del que no se sale con el teclado atrapa.
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto, onCerrar]);

  const huecos = estado === "preguntas" ? prev?.huecos ?? [] : [];
  const hueco = huecos[actual] ?? null;
  const campo = prev?.campos.find((c) => c.nombre === hueco?.nombre) ?? null;
  useEffect(() => { setBorrador(campo?.valor ?? campo?.propuesta ?? ""); }, [campo?.nombre, campo?.valor, campo?.propuesta]);
  useEffect(() => {
    if (!hueco || !cuerpoRef.current) return;
    cuerpoRef.current.querySelector<HTMLElement>(`[data-hueco="${hueco.nombre}-${hueco.offset}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hueco]);

  async function contestar(nombre: string, valor: string) {
    if (!tareaId) return;
    setGuardando(true);
    try {
      const r = await fetch(`${apiBase}/tareas/${tareaId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo: nombre, valor }),
      });
      if (r.ok) setVista((await r.json()).data as VistaEncargo);
      // Se recarga TODO: si el dato gobernaba un `{{IF}}`, el documento es otro.
      await cargarPrev();
      setActual(0);
    } finally { setGuardando(false); }
  }

  async function incorporar() {
    if (!tareaId || !incorporarEn) return;
    setIncorporando(true);
    try {
      const r = await fetch(`${apiBase}/tareas/${tareaId}/incorporar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(incorporarEn),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.data?.nodeId) {
        onIncorporado?.({ tareaId, nodeId: j.data.nodeId });
        await leerEstado();
      }
    } finally { setIncorporando(false); }
  }

  if (!abierto) return null;

  const e = vista?.encargo ?? null;
  const pasos = e?.pasos ?? [];
  const incorporado = !!e?.incorporado;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        {/* ── cabecera ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-gray-900">{titulo ?? vista?.nombre ?? t("ui.generacionRedactor.titulo")}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {[vista?.referencia, vista?.esquema].filter(Boolean).join(" · ")}
              {vista?.generadoAt && <> · {t("ui.generacionRedactor.generadoEl", { f: new Date(vista.generadoAt).toLocaleString() })}</>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {estado === "listo" && tareaId && (
              <>
                {incorporarEn && (
                  <Button size="sm" variant={incorporado ? "outline" : "default"} disabled={incorporando || incorporado} onClick={() => void incorporar()}>
                    {incorporando ? <Loader2 className="h-4 w-4 animate-spin" /> : incorporado ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    <span className="ml-1.5">{incorporado ? t("ui.generacionRedactor.incorporado") : t("ui.generacionRedactor.incorporar")}</span>
                  </Button>
                )}
                <a href={`${apiBase}/tareas/${tareaId}/docx`} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
                  <Download className="h-4 w-4" />{t("ui.generacionRedactor.descargar")}
                </a>
                <a href={`${apiBase}/tareas/${tareaId}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
                  <Printer className="h-4 w-4" />{t("ui.generacionRedactor.imprimir")}
                </a>
              </>
            )}
            <button type="button" onClick={onCerrar} aria-label={t("ui.generacionRedactor.cerrar")} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── preguntas: la firma ──────────────────────────────────────────── */}
        {estado === "preguntas" && e?.firma && (
          <div className="border-b border-gray-200 bg-amber-50/60 p-4">
            <p className="font-medium text-gray-900">{t("ui.generacionRedactor.quienFirma")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {e.firma.opciones.map((o) => (
                <Button key={o} size="sm" variant="outline" disabled={guardando} onClick={() => void contestar("NOMBRE_NOTARIO", o)}>{o}</Button>
              ))}
            </div>
          </div>
        )}

        {/* ── preguntas: los huecos ────────────────────────────────────────── */}
        {estado === "preguntas" && hueco && campo && (
          <div className="border-b border-gray-200 bg-amber-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-gray-900">{campo.etiqueta}</span>
                {campo.gobierna && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900">{t("ui.escrituraModal.gobierna")}</span>}
                {campo.instruccion && <p className="mt-0.5 text-xs text-gray-600">{campo.instruccion}</p>}
                {!campo.valor && campo.propuesta && <p className="mt-0.5 text-xs text-amber-800">{t("ui.generacionRedactor.propuesta")}</p>}
              </div>
              <span className="text-sm tabular-nums text-gray-600">{t("ui.generacionRedactor.quedan", { n: huecos.length })}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {campo.opciones.length > 0 ? (
                <select value={borrador} onChange={(ev) => setBorrador(ev.target.value)} className="min-w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                  <option value="">—</option>
                  {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : campo.tipo === "BOOL" ? (
                <select value={borrador} onChange={(ev) => setBorrador(ev.target.value)} className="min-w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="SI">{t("ui.escrituraModal.si")}</option>
                  <option value="NO">{t("ui.escrituraModal.no")}</option>
                </select>
              ) : (
                <input value={borrador} onChange={(ev) => setBorrador(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" && borrador) { ev.preventDefault(); void contestar(campo.nombre, borrador); } }}
                  type={campo.tipo === "DATE" ? "date" : campo.tipo === "NUM" ? "number" : "text"}
                  className="min-w-64 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
              )}
              <Button size="sm" disabled={guardando || !borrador} onClick={() => void contestar(campo.nombre, borrador)}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : t("ui.escrituraModal.guardar")}
              </Button>
            </div>
          </div>
        )}

        {/* ── el cuerpo ────────────────────────────────────────────────────── */}
        <div ref={cuerpoRef} className="min-h-0 flex-1 overflow-auto p-4">
          {errorCrear && <AlertBanner type="error" message={errorCrear} />}

          {estado === "trabajando" && (
            <div className="mx-auto max-w-xl py-6">
              <p className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-800">
                <Loader2 className="h-4 w-4 animate-spin text-mc-action-600" />{t("ui.generacionRedactor.trabajando")}
              </p>
              <ol className="space-y-2">
                {pasos.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 text-sm">
                    {p.estado === "en_curso" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-mc-action-600" />
                      : p.estado === "hecho" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        : p.estado === "aviso" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                          : p.estado === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                            : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />}
                    <span className={p.estado === "en_curso" ? "text-gray-900" : "text-gray-600"}>{p.texto}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {estado === "error" && (
            <div className="mx-auto max-w-xl space-y-3 py-6">
              <AlertBanner type="error" message={e?.error?.message ?? t("ui.generacionRedactor.noDisponible")} />
              {encargo && (
                <Button size="sm" variant="outline" onClick={() => { setVista(null); void encargar(); }}>
                  <RotateCcw className="h-4 w-4" /><span className="ml-1.5">{t("ui.generacionRedactor.reintentar")}</span>
                </Button>
              )}
            </div>
          )}

          {estado === "preguntas" && !e?.firma && prev && huecos.length === 0 && (
            <AlertBanner type="info" message={t("ui.generacionRedactor.sinPreguntas")} />
          )}

          {/* Preguntando, el texto tal cual con los huecos marcados: lo que hay que ver es DÓNDE falta. */}
          {estado === "preguntas" && prev && <Escritura markdown={prev.markdown} resaltado={hueco} />}
          {/* Listo, el documento como se lee: lo que se va a incorporar, descargar o imprimir. */}
          {estado === "listo" && prev && (
            <>
              <p className="mb-3 flex items-center gap-2 text-sm text-gray-600">
                <FileText className="h-4 w-4" />{t("ui.generacionRedactor.vistaPrevia")}
              </p>
              <article className="mx-auto max-w-3xl rounded-md border border-gray-200 bg-white p-8 font-serif text-[15px] leading-relaxed text-gray-900 shadow-sm">
                <Markdown>{prev.markdown}</Markdown>
              </article>
            </>
          )}
        </div>

        {/* ── la cinta del motor ───────────────────────────────────────────── */}
        <DocFillingCinta />
      </div>
    </div>
  );
}
