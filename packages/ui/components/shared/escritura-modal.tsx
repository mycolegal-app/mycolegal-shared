"use client";

// EL MODAL DE LA ESCRITURA: leerla, completarla y descargarla.
//
// Lo pidió Carles así: devolver **markdown** para ver la escritura en un modal,
// con un navegador entre los campos que faltan —señalando en el markdown dónde
// falta cada uno— y un enlace al `.docx`; y si no falta ninguno, el markdown y
// el botón de descarga.
//
// LA REGLA QUE GOBIERNA ESTA PANTALLA
//
// **Un campo que gobierna un `{{IF}}` se pregunta ANTES que un dato.** No es
// una preferencia de orden: contestarlo reescribe el documento —cambia qué
// cláusulas contiene— y con ello qué otros huecos existen y dónde están. Por
// eso, al guardar, esto **no parchea su copia del markdown**: vuelve a pedirlo
// todo. Un modal que sustituyera el valor en el texto que ya tiene enseñaría
// una escritura que no existe.
//
// El servidor manda el orden (los gobernantes primero, por nivel de
// anidamiento) y aquí se recorre el array tal cual. Si el orden lo decidiera la
// pantalla, la de Notaría podría ordenar distinto y los dos flujos derivarían.
//
// SÓLO SE OFRECE LA FRONTERA, Y ESO LO CORRIGIÓ CARLES
//
// Mi primera versión enseñaba **todos** los gobernantes pendientes. Él preguntó
// si de verdad eran todos de primer nivel, y la medición le dio la razón: de los
// 87 de una compraventa, **58 son de nivel 0** y los otros 29 viven dentro de
// condiciones que aún no se han decidido. Ofrecerlos es pedirle a alguien que
// decida por una cláusula que puede no llegar a existir.
//
// Así que el servidor manda sólo la frontera —el nivel más superficial sin
// decidir— y los de debajo se **cuentan** en la cabecera. El número explica por
// qué la lista cambia al avanzar, en vez de que parezca que crece sin motivo.
//
// ⚠️ Lo que esta pantalla sigue sin poder arreglar: contestar los 58 de nivel 0
// destapa 81 de nivel 1. Una persona no puede conducir eso, y el recuento se
// enseña sin maquillar porque lo que hace usable esto es que la IA resuelva el
// grueso (F5).

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, X } from "lucide-react";
import { Button } from "../ui/button";
import { AlertBanner } from "./alert-banner";
import { useI18n } from "../i18n/i18n-context";

/** La marca que el servidor pone donde falta un dato. */
const MARCA = /␣([A-Z0-9_]+)␣/g;

export interface HuecoEscritura {
  nombre: string; etiqueta: string; tipo: string; offset: number; contexto: string;
}
export interface CampoEscritura {
  nombre: string; etiqueta: string; tipo: string; opciones: string[];
  instruccion: string | null; quien: string; valor: string | null;
  gobierna: boolean; nivel: number; porque?: string;
}
export interface PrevisualizacionEscritura {
  markdown: string;
  huecos: HuecoEscritura[];
  campos: CampoEscritura[];
  pendientes: number;
  gobernantesPendientes: number;
  /** El nivel más superficial sin decidir. `null` = no queda ninguno. */
  frontera: number | null;
  /** Lo contestable AHORA. */
  enFrontera: number;
  /** Lo que depende de contestar la frontera: se cuenta, no se ofrece. */
  despuesDeFrontera: number;
  condicionesSinDeterminar: number;
  faltantes: string[];
  concordancias: number;
  directivasPendientes: string[];
  plantilla: { nombre: string; ambito: string; porque: string };
  generadoAt: string | null;
  docxUrl: string;
}

export interface EscrituraModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Prefijo de la API de generación; en una app que embeba, su proxy. */
  apiBase?: string;
  tareaId: string;
  titulo?: string;
}

export function EscrituraModal({
  abierto, onCerrar, apiBase = "/api/generacion", tareaId, titulo,
}: EscrituraModalProps) {
  const { t } = useI18n();
  const [prev, setPrev] = useState<PrevisualizacionEscritura | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actual, setActual] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const cuerpoRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/tareas/${tareaId}/previsualizar`);
      if (!r.ok) { setError(t("ui.escrituraModal.noDisponible")); return; }
      const { data } = await r.json();
      setPrev(data as PrevisualizacionEscritura);
      setError(null);
    } finally { setCargando(false); }
  }, [apiBase, tareaId, t]);

  useEffect(() => { if (abierto) void cargar(); }, [abierto, cargar]);

  // Cerrar con Escape: un modal del que no se sale con el teclado es un modal
  // que atrapa.
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto, onCerrar]);

  const huecos = prev?.huecos ?? [];
  const hueco = huecos[actual] ?? null;
  const campo = prev?.campos.find((c) => c.nombre === hueco?.nombre) ?? null;

  useEffect(() => { setBorrador(campo?.valor ?? ""); }, [campo?.nombre, campo?.valor]);

  // Llevar el hueco actual a la vista. Es la mitad de lo que pidió Carles
  // —«mostrando en el markdown dónde falta el campo»—: sin esto el navegador
  // diría el nombre del campo y dejaría al oficial buscándolo.
  useEffect(() => {
    if (!hueco || !cuerpoRef.current) return;
    const el = cuerpoRef.current.querySelector<HTMLElement>(`[data-hueco="${hueco.nombre}-${hueco.offset}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hueco]);

  async function guardar() {
    if (!hueco || !prev) return;
    setGuardando(true);
    try {
      await fetch(`${apiBase}/tareas/${tareaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo: hueco.nombre, valor: borrador }),
      });
      // Se recarga TODO. Ver la cabecera: si el campo gobernaba un `{{IF}}`, el
      // documento es otro y los huecos están en otro sitio.
      await cargar();
      setActual(0);
    } finally { setGuardando(false); }
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        {/* ── cabecera ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-gray-900">{titulo ?? t("ui.escrituraModal.titulo")}</h2>
            {prev && (
              <p className="mt-0.5 text-xs text-gray-500">
                {/* El recuento, sin maquillar: es la verdad del documento. */}
                {t("ui.escrituraModal.resumen", {
                  h: huecos.length, g: prev.enFrontera, d: prev.pendientes,
                })}
                {prev.despuesDeFrontera > 0 && (
                  <> · {t("ui.escrituraModal.dependen", { n: prev.despuesDeFrontera })}</>
                )}
                {" · "}
                <span title={prev.plantilla.porque}>{prev.plantilla.nombre}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {prev && (
              <a href={prev.docxUrl} className="inline-flex items-center gap-1.5 rounded-md bg-mc-action-600 px-3 py-1.5 text-sm text-white hover:bg-mc-action-700">
                <Download className="h-4 w-4" />
                {prev.generadoAt ? t("ui.escrituraModal.descargar") : t("ui.escrituraModal.descargarBorrador")}
              </a>
            )}
            <button type="button" onClick={onCerrar} aria-label={t("ui.escrituraModal.cerrar")}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── el navegador de huecos ───────────────────────────────────────── */}
        {hueco && campo && (
          <div className="border-b border-gray-200 bg-amber-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900">{campo.etiqueta}</span>
                  {campo.gobierna && (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900"
                      title={campo.porque ? t("ui.escrituraModal.condicion", { c: campo.porque }) : undefined}>
                      {t("ui.escrituraModal.gobierna")}
                    </span>
                  )}
                </div>
                {campo.instruccion && <p className="mt-0.5 text-xs text-gray-600">{campo.instruccion}</p>}
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <button type="button" disabled={actual === 0} onClick={() => setActual((i) => i - 1)}
                  className="rounded p-1 hover:bg-amber-100 disabled:opacity-40" aria-label={t("ui.escrituraModal.anterior")}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="tabular-nums">{actual + 1} / {huecos.length}</span>
                <button type="button" disabled={actual >= huecos.length - 1} onClick={() => setActual((i) => i + 1)}
                  className="rounded p-1 hover:bg-amber-100 disabled:opacity-40" aria-label={t("ui.escrituraModal.siguiente")}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {campo.opciones.length > 0 ? (
                <select value={borrador} onChange={(e) => setBorrador(e.target.value)}
                  className="min-w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                  <option value="">—</option>
                  {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : campo.tipo === "BOOL" ? (
                <select value={borrador} onChange={(e) => setBorrador(e.target.value)}
                  className="min-w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="SI">{t("ui.escrituraModal.si")}</option>
                  <option value="NO">{t("ui.escrituraModal.no")}</option>
                </select>
              ) : (
                <input
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(); } }}
                  type={campo.tipo === "DATE" ? "date" : campo.tipo === "NUM" ? "number" : "text"}
                  className="min-w-64 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                />
              )}
              <Button size="sm" disabled={guardando} onClick={() => void guardar()}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : t("ui.escrituraModal.guardar")}
              </Button>
            </div>
          </div>
        )}

        {/* ── la escritura ─────────────────────────────────────────────────── */}
        <div ref={cuerpoRef} className="min-h-0 flex-1 overflow-auto p-4">
          {cargando && (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />{t("ui.escrituraModal.cargando")}
            </p>
          )}
          {error && <AlertBanner type="error" message={error} />}
          {prev && !prev.generadoAt && huecos.length === 0 && (
            <AlertBanner type="success" message={t("ui.escrituraModal.sinHuecos")} />
          )}
          {prev && prev.faltantes.length > 0 && (
            <AlertBanner type="warning" message={t("ui.escrituraModal.faltanParrafos", { n: prev.faltantes.length })} />
          )}
          {prev && <Escritura markdown={prev.markdown} resaltado={hueco} />}
        </div>
      </div>
    </div>
  );
}

/**
 * La escritura, con los huecos resaltados en su sitio.
 *
 * Se parte el texto por las marcas y se pinta cada trozo: así cada hueco es un
 * elemento con su `data-hueco`, y el navegador puede llevarlo a la vista. Es
 * texto preformateado y no markdown renderizado **a propósito**: lo que el
 * oficial tiene que revisar es lo que va a salir, y un `**` convertido en
 * negrita esconde que el `**` está ahí.
 */
function Escritura({ markdown, resaltado }: { markdown: string; resaltado: HuecoEscritura | null }) {
  const trozos: React.ReactNode[] = [];
  let ultimo = 0;
  let k = 0;
  for (const m of markdown.matchAll(MARCA)) {
    const i = m.index;
    if (i > ultimo) trozos.push(markdown.slice(ultimo, i));
    const esActual = resaltado?.nombre === m[1] && resaltado?.offset === i;
    trozos.push(
      <mark
        key={`h${k++}`}
        data-hueco={`${m[1]}-${i}`}
        className={esActual
          ? "rounded bg-amber-300 px-1 font-medium text-amber-950 ring-2 ring-amber-500"
          : "rounded bg-amber-100 px-1 text-amber-900"}
      >
        {m[1]}
      </mark>,
    );
    ultimo = i + m[0].length;
  }
  if (ultimo < markdown.length) trozos.push(markdown.slice(ultimo));

  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-900">
      {trozos}
    </pre>
  );
}
