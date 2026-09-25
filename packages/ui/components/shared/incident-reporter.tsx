"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Camera, Send, Loader2, X, Paperclip, Upload, Minus, Maximize2, Lightbulb, ChevronLeft, GripHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useI18n } from "../i18n/i18n-context";
import { apiErrorMessage } from "../../lib/api-error";
// #875 — esquina configurable del botón flotante. #889 — anclaje al soltar.
import {
  useFloatingCorner,
  CORNER_CLASSES,
  esquinaMasCercana,
  type FloatingCorner,
} from "./use-floating-corner";

/** Píxeles a partir de los cuales un gesto deja de ser clic y es arrastre. */
const UMBRAL_ARRASTRE = 4;

/** Clave i18n de cada esquina (`ui.incidentReporter.*`). */
const ETIQUETA_ESQUINA: Record<FloatingCorner, string> = {
  "bottom-right": "esquinaAbajoDerecha",
  "bottom-left": "esquinaAbajoIzquierda",
  "top-right": "esquinaArribaDerecha",
  "top-left": "esquinaArribaIzquierda",
};

interface IncidentReporterProps {
  /** App slug sent with the report (e.g. "notaria", "legifirma"). */
  appSlug: string;
  /** POST endpoint for the report. Defaults to the app's own proxy route. */
  submitUrl?: string;
  /**
   * Keyboard shortcut that toggles the floating bug button's visibility
   * (defaults to Ctrl/Cmd+Shift+B). The dialog is only opened by clicking
   * the button itself — the shortcut is purely for show/hide.
   */
  shortcut?: { key: string; shift?: boolean; alt?: boolean };
}

const DEFAULT_SHORTCUT = { key: "B", shift: true };
const MAX_CONSOLE_ERRORS = 5;
const VISIBILITY_STORAGE_KEY = "mycolegal:incident-reporter:visible";
// Prefix for the persisted, not-yet-sent report text. Keyed by appSlug so a
// draft started in one app never bleeds into another. Persisting on every
// keystroke means a session expiry / redirect to /login mid-typing no longer
// loses the text — reopening the reporter rehydrates it.
const DRAFT_STORAGE_PREFIX = "mycolegal:incident-reporter:draft:";
// #162 — adjuntos que el usuario puede añadir al CREAR la incidencia. El
// backend (storeAttachment) corta a 5 MB por fichero; aquí validamos antes de
// subir para dar feedback inmediato. Tope de nº alineado con el schema de auth.
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Naturaleza del reporte, elegida en el primer paso del reporter:
 * - "incident": algo falla / no funciona como debería.
 * - "improvement": propuesta de mejora / sugerencia.
 * El backend lo persiste en `IncidentReport.kind`; la pantalla es la misma,
 * solo cambia el lenguaje (y, en mejora, no adjuntamos los errores de consola).
 */
type ReportKind = "incident" | "improvement";

interface PendingAttachment {
  filename: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
}

/** Reads a File into a base64 data URL (same shape the thread upload uses). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatShortcut(s: { key: string; shift?: boolean; alt?: boolean }): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  parts.push(isMac ? "⌘" : "Ctrl");
  if (s.shift) parts.push(isMac ? "⇧" : "Shift");
  if (s.alt) parts.push(isMac ? "⌥" : "Alt");
  parts.push(s.key.toUpperCase());
  return parts.join(isMac ? "" : "+");
}

interface CapturedError {
  message: string;
  source?: string;
  at: string;
}

/** Ring buffer of recent `window.onerror` / `unhandledrejection` messages. */
function useConsoleErrorCapture(): CapturedError[] {
  const ref = useRef<CapturedError[]>([]);
  const [snap, setSnap] = useState<CapturedError[]>([]);

  useEffect(() => {
    const push = (err: CapturedError) => {
      ref.current = [...ref.current.slice(-(MAX_CONSOLE_ERRORS - 1)), err];
      setSnap(ref.current);
    };

    const onError = (e: ErrorEvent) => {
      push({
        message: e.message || String(e.error),
        source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
        at: new Date().toISOString(),
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      push({
        message: e.reason?.message || String(e.reason),
        at: new Date().toISOString(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return snap;
}

/**
 * In-app incident reporter. Mount once at the app root. On Ctrl/Cmd+Shift+B
 * (or the floating bug button), takes a DOM screenshot, lets the user
 * describe the problem, and POSTs everything to `submitUrl` — which the app
 * is expected to proxy to mycolegal-auth's `POST /incidents`.
 */
export function IncidentReporter({
  appSlug,
  submitUrl = "/api/incidents",
  shortcut = DEFAULT_SHORTCUT,
}: IncidentReporterProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Naturaleza elegida en el primer paso. `null` = aún mostrando la elección
  // (incidencia vs propuesta de mejora); una vez elegida, se muestra el
  // formulario de siempre con el lenguaje adaptado.
  const [kind, setKind] = useState<ReportKind | null>(null);
  // #306 — el modal puede minimizarse a una barra para echar un vistazo a la
  // pantalla sin perder lo escrito. `minimizeRef` evita que el cierre del Dialog
  // (al ocultarse por minimizar) se interprete como cerrar del todo.
  const [minimized, setMinimized] = useState(false);
  const minimizeRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | "ok" | "error">(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  // The button is visible by default; the shortcut flips it, and the
  // preference is persisted to localStorage so it survives reloads.
  const [visible, setVisible] = useState(true);
  // #875 — Esquina del botón flotante (persistida) + selector abierto/cerrado.
  // Nótese que el atajo de teclado ya permitía OCULTARLO; lo que faltaba era
  // poder APARTARLO, que es lo que se necesita cuando tapa un control y aun así
  // quieres seguir pudiendo avisar.
  const { corner, setCorner, corners } = useFloatingCorner();
  const [moverAbierto, setMoverAbierto] = useState(false);
  // #889 — arrastre del asa. `arrastre` es la posición del puntero mientras se
  // arrastra (null = no se está arrastrando); sirve para pintar el botón bajo
  // el dedo y para saber, al soltar, a qué esquina anclar.
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);
  // Un arrastre corto es en realidad un clic: abre el menú en vez de anclar.
  const arrastreInicio = useRef<{ x: number; y: number } | null>(null);
  // #162 — user-provided attachments for the new incident.
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Contexto que llega con el evento de apertura (p.ej. «reportar esta respuesta»
  // de MycoBot): texto pre-rellenado, naturaleza preseleccionada y datos extra que
  // viajan en `metadata.context` para que el agente de incidencias los lea.
  const externalContextRef = useRef<{ extra?: Record<string, unknown> } | null>(null);

  const consoleErrors = useConsoleErrorCapture();

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setAttachError(null);
      const incoming = Array.from(fileList);
      const accepted: PendingAttachment[] = [];
      for (const file of incoming) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachError(t("ui.incidentReporter.attachTooBig", { name: file.name }));
          continue;
        }
        try {
          const dataBase64 = await fileToDataUrl(file);
          accepted.push({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            dataBase64,
            sizeBytes: file.size,
          });
        } catch {
          setAttachError(t("ui.incidentReporter.attachReadError", { name: file.name }));
        }
      }
      setAttachments((prev) => {
        const room = MAX_ATTACHMENTS - prev.length;
        if (accepted.length > room) {
          setAttachError(t("ui.incidentReporter.attachTooMany", { max: MAX_ATTACHMENTS }));
        }
        return [...prev, ...accepted.slice(0, Math.max(0, room))];
      });
    },
    [t],
  );

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const draftKey = `${DRAFT_STORAGE_PREFIX}${appSlug}`;

  // Persist the in-progress report text so it survives a session expiry,
  // redirect to /login, or accidental dialog close. Cleared only on a
  // successful send. localStorage may be blocked (private mode) — ignore.
  const updateDescription = useCallback(
    (text: string) => {
      setDescription(text);
      try {
        if (text) window.localStorage.setItem(draftKey, text);
        else window.localStorage.removeItem(draftKey);
      } catch {
        // localStorage unavailable — the draft just won't survive a reload.
      }
    },
    [draftKey],
  );

  const captureScreenshot = useCallback(async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const mod = await import("html2canvas");
      const html2canvas = (mod.default || mod) as typeof import("html2canvas").default;
      const canvas = await html2canvas(document.body, {
        backgroundColor: null,
        logging: false,
        useCORS: true,
        // Cap scale so the resulting JPEG stays reasonable on 4K screens.
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
      });
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      setScreenshot(dataUrl);
    } catch (err) {
      console.error("Screenshot capture failed", err);
      setScreenshot(null);
      // Preserve the failure reason so we can submit it as metadata. Without
      // this, silent failures look identical to "user clicked cancel" and
      // we have no way to diagnose why capture failed on a given page.
      const msg = (err as Error)?.message || String(err);
      setCaptureError(msg.slice(0, 500));
    } finally {
      setCapturing(false);
    }
  }, []);

  const openReporter = useCallback(async (opts?: { prefill?: string; kind?: ReportKind; extra?: Record<string, unknown> }) => {
    setResult(null);
    setErrorMessage("");
    // Rehydrate any unsent draft (e.g. the previous attempt was interrupted by
    // a session expiry) instead of starting blank, so the user never loses
    // what they had already written.
    let draft = "";
    try {
      draft = window.localStorage.getItem(draftKey) ?? "";
    } catch {
      // localStorage blocked — start empty.
    }
    // Un pre-relleno externo (p.ej. la respuesta de MycoBot que se reporta) manda
    // sobre el borrador: es lo que el usuario acaba de pedir reportar.
    setDescription(opts?.prefill ? opts.prefill : draft);
    externalContextRef.current = opts?.extra ? { extra: opts.extra } : null;
    setScreenshot(null);
    setAttachments([]);
    setAttachError(null);
    // Cada apertura arranca en el paso de elección incidencia vs mejora, salvo que
    // quien abre ya sepa la naturaleza (reporte de una respuesta de IA = incidencia).
    setKind(opts?.kind ?? null);
    // Capture BEFORE opening the dialog so the overlay + modal don't end up
    // in the screenshot. captureScreenshot manages its own capturing state.
    await captureScreenshot();
    setMinimized(false);
    setOpen(true);
  }, [captureScreenshot, draftKey]);

  // #306 — cierre real del Dialog. Si el "cierre" viene de minimizar (Dialog se
  // oculta), lo ignoramos para no cerrar del todo ni perder lo escrito.
  const handleOpenChange = useCallback((v: boolean) => {
    if (!v && minimizeRef.current) {
      minimizeRef.current = false;
      return;
    }
    setOpen(v);
    if (!v) setMinimized(false);
  }, []);

  // Hydrate the persisted visibility once on mount. We default to visible
  // (so a fresh session still shows the bug) and only flip when a previous
  // session explicitly stored "false".
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (stored === "false") setVisible(false);
    } catch {
      // localStorage may be blocked (private mode); ignore — default stands.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const metaOrCtrl = e.metaKey || e.ctrlKey;
      const matchesKey = e.key.toUpperCase() === (shortcut.key || "B").toUpperCase();
      const matchesShift = shortcut.shift ? e.shiftKey : true;
      const matchesAlt = shortcut.alt ? e.altKey : true;
      if (metaOrCtrl && matchesShift && matchesAlt && matchesKey) {
        e.preventDefault();
        setVisible((v) => {
          const next = !v;
          try { window.localStorage.setItem(VISIBILITY_STORAGE_KEY, String(next)); } catch {}
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut]);

  // Public imperative trigger: any component can do
  // `window.dispatchEvent(new CustomEvent("mycolegal:open-incident-reporter"))`
  // to open the modal (e.g. CTA en empty state de /incidencias).
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ prefill?: string; kind?: ReportKind; extra?: Record<string, unknown> } | undefined>).detail;
      void openReporter(d ?? undefined);
    };
    window.addEventListener("mycolegal:open-incident-reporter", handler);
    return () => window.removeEventListener("mycolegal:open-incident-reporter", handler);
  }, [openReporter]);

  const submit = useCallback(async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    setResult(null);
    setErrorMessage("");
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSlug,
          // Naturaleza elegida en el primer paso. Fallback defensivo a
          // "incident" (el backend también aplica ese default).
          kind: kind ?? "incident",
          description: description.trim(),
          pageUrl: window.location.href,
          screenshot,
          userAgent: navigator.userAgent,
          metadata: {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            dpr: window.devicePixelRatio || 1,
            language: navigator.language,
            platform: (navigator as any).platform,
            // Los errores de consola solo aportan al diagnóstico de una
            // incidencia; en una propuesta de mejora no son relevantes.
            consoleErrors: kind === "improvement" ? [] : consoleErrors,
            screenshotCaptureError: captureError,
            capturedAt: new Date().toISOString(),
            // Contexto de quien abrió el reporter (conversación de MycoBot, traza de
            // la respuesta reportada…). Ausente en los reportes manuales.
            ...(externalContextRef.current?.extra ? { context: externalContextRef.current.extra } : {}),
          },
          // #162 — adjuntos del usuario (sin sizeBytes, que es solo de UI).
          attachments: attachments.length
            ? attachments.map(({ filename, mimeType, dataBase64 }) => ({ filename, mimeType, dataBase64 }))
            : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          body?.error?.message || (typeof body?.error === "string" ? body.error : undefined) || body?.message;
        throw new Error(
          apiErrorMessage(t, { status: res.status, code: body?.error?.code, message }, t("ui.incidentReporter.errSend")),
        );
      }
      setResult("ok");
      // Limpiar el estado en memoria además del draft persistido: si no, al
      // reabrir el reporter (creyendo que no se envió) el texto seguía ahí y
      // un segundo submit generaba un duplicado idéntico (#361/#362).
      setAttachments([]);
      setDescription("");
      setScreenshot(null);
      // Sent successfully — discard the persisted draft so the next open
      // starts blank.
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      // Auto-close after short success flash
      setTimeout(() => setOpen(false), 1200);
    } catch (err: any) {
      setResult("error");
      setErrorMessage(err?.message || t("ui.incidentReporter.errSend"));
    } finally {
      setSubmitting(false);
    }
  }, [appSlug, attachments, captureError, consoleErrors, description, draftKey, kind, screenshot, submitUrl, t]);

  const shortcutLabel = formatShortcut(shortcut);

  // Textos adaptados a la naturaleza elegida. Misma pantalla, distinto
  // lenguaje: en propuesta de mejora usamos las claves `*Improvement`.
  const isImprovement = kind === "improvement";
  const headerTitle = isImprovement
    ? t("ui.incidentReporter.titleImprovement")
    : t("ui.incidentReporter.title");
  const headerDescription = isImprovement
    ? t("ui.incidentReporter.descriptionImprovement")
    : t("ui.incidentReporter.description");
  const descLabel = isImprovement
    ? t("ui.incidentReporter.descriptionLabelImprovement")
    : t("ui.incidentReporter.descriptionLabel");
  const descPlaceholder = isImprovement
    ? t("ui.incidentReporter.descriptionPlaceholderImprovement")
    : t("ui.incidentReporter.descriptionPlaceholder");
  const sendLabel = isImprovement
    ? t("ui.incidentReporter.btnSendImprovement")
    : t("ui.incidentReporter.btnSend");
  const sentOkLabel = isImprovement
    ? t("ui.incidentReporter.sentOkImprovement")
    : t("ui.incidentReporter.sentOk");
  const minimizedLabel = isImprovement
    ? t("ui.incidentReporter.minimizedLabelImprovement")
    : t("ui.incidentReporter.minimizedLabel");

  return (
    <>
      {/* #875 — El botón es `fixed`, así que ocupa su esquina pase lo que pase
          debajo. En la cola de trámites de un protocolo tapaba la papelera del
          ÚLTIMO trámite, y al ser el final de la lista no había forma de
          desplazarla: el trámite quedaba imposible de borrar.
          El colchón inferior del shell evita la colisión en el caso normal; esto
          le da al usuario la salida para cualquier pantalla que no previmos.
          Cuatro esquinas y no arrastre libre: con posiciones discretas es
          IMPOSIBLE dejar el botón fuera de pantalla al cambiar de monitor. */}
      {/* #889 — Mientras se arrastra: el botón sigue al puntero y la esquina de
          destino se marca, para que se vea ADÓNDE va a anclar antes de soltar.
          Sin esto el arrastre se siente igual de muerto que antes. */}
      {visible && arrastre && (
        <>
          <div
            className="pointer-events-none fixed z-[131] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy opacity-70 shadow-lg ring-1 ring-white/40 print:hidden"
            style={{ left: arrastre.x, top: arrastre.y }}
            aria-hidden
          />
          <div
            className={`pointer-events-none fixed ${
              CORNER_CLASSES[
                esquinaMasCercana(
                  arrastre.x,
                  arrastre.y,
                  typeof window === "undefined" ? 0 : window.innerWidth,
                  typeof window === "undefined" ? 0 : window.innerHeight,
                )
              ]
            } z-[129] h-10 w-10 rounded-full border-2 border-dashed border-navy/50 print:hidden`}
            aria-hidden
          />
        </>
      )}

      {visible && (
        <div
          className={`fixed ${CORNER_CLASSES[corner]} z-[130] print:hidden ${
            arrastre ? "opacity-30" : ""
          }`}
        >
          <div className="group relative">
            <button
              type="button"
              onClick={() => void openReporter()}
              onContextMenu={(e) => {
                // Atajo para quien lo intuya. La agarradera visible de abajo es
                // la vía descubrible; el clic derecho, un acelerador.
                e.preventDefault();
                setMoverAbierto((v) => !v);
              }}
              title={t("ui.incidentReporter.btnTooltip", { shortcut: shortcutLabel })}
              aria-label={t("ui.incidentReporter.btnAria", { shortcut: shortcutLabel })}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white shadow-lg ring-1 ring-white/40 transition-transform hover:scale-105 hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-cyan"
            >
              <Bug className="h-5 w-5" />
            </button>

            {/* Agarradera: aparece al pasar el ratón (o con el foco en el
                teclado, que es lo que la hace accesible sin ratón). Sin ella el
                selector solo lo encontraría quien pruebe el clic derecho.

                #889 — y SE ARRASTRA. El icono es un agarre, así que quien la ve
                tira de ella; en #875 sólo abría el menú al soltar sin mover, y
                el botón se quedaba donde estaba. Ahora el arrastre mueve el
                botón de verdad y al soltar lo ancla a la esquina del cuadrante,
                que conserva la garantía de no poder dejarlo fuera de pantalla.
                Un gesto corto (sin superar el umbral) sigue siendo un clic y
                abre el menú, que es la vía accesible y la de teclado. */}
            <button
              type="button"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                arrastreInicio.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                const ini = arrastreInicio.current;
                if (!ini) return;
                const lejos =
                  Math.abs(e.clientX - ini.x) > UMBRAL_ARRASTRE ||
                  Math.abs(e.clientY - ini.y) > UMBRAL_ARRASTRE;
                if (lejos) {
                  setMoverAbierto(false);
                  setArrastre({ x: e.clientX, y: e.clientY });
                }
              }}
              onPointerUp={(e) => {
                const ini = arrastreInicio.current;
                arrastreInicio.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                if (!ini) return;
                const movido =
                  Math.abs(e.clientX - ini.x) > UMBRAL_ARRASTRE ||
                  Math.abs(e.clientY - ini.y) > UMBRAL_ARRASTRE;
                setArrastre(null);
                if (movido) {
                  setCorner(
                    esquinaMasCercana(e.clientX, e.clientY, window.innerWidth, window.innerHeight),
                  );
                } else {
                  setMoverAbierto((v) => !v);
                }
              }}
              onPointerCancel={() => {
                arrastreInicio.current = null;
                setArrastre(null);
              }}
              onContextMenu={(e) => {
                // Mismo acelerador que sobre el botón: quien prueba el clic
                // derecho sobre el asa esperaba el menú, no el del navegador.
                e.preventDefault();
                setMoverAbierto((v) => !v);
              }}
              title={t("ui.incidentReporter.moverTitulo")}
              aria-label={t("ui.incidentReporter.moverAria")}
              aria-expanded={moverAbierto}
              className={`absolute -top-2 left-1/2 -translate-x-1/2 cursor-grab touch-none rounded-full border border-gray-200 bg-white p-0.5 text-gray-500 shadow transition-opacity hover:text-navy focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-cyan group-hover:opacity-100 active:cursor-grabbing ${
                arrastre ? "opacity-100" : "opacity-0"
              }`}
            >
              <GripHorizontal className="h-3 w-3" />
            </button>

            {moverAbierto && (
              <div
                className={`absolute ${corner.startsWith("bottom") ? "bottom-12" : "top-12"} ${
                  corner.endsWith("right") ? "right-0" : "left-0"
                } w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-xl`}
                role="group"
                aria-label={t("ui.incidentReporter.moverAria")}
              >
                <p className="mb-1.5 px-1 text-xs font-medium text-gray-500">
                  {t("ui.incidentReporter.moverTitulo")}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {corners.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCorner(c);
                        setMoverAbierto(false);
                      }}
                      className={`rounded-md px-2 py-1.5 text-xs transition-colors ${
                        c === corner
                          ? "bg-navy text-white"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {t(`ui.incidentReporter.${ETIQUETA_ESQUINA[c]}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* #306 — barra minimizada: deja ver la pantalla sin perder el borrador. */}
      {open && minimized && (
        <div className="fixed bottom-6 right-6 z-[130] flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg print:hidden">
          {isImprovement ? (
            <Lightbulb className="h-4 w-4 shrink-0 text-navy" />
          ) : (
            <Bug className="h-4 w-4 shrink-0 text-navy" />
          )}
          <span className="text-sm font-medium text-gray-800">
            {minimizedLabel}
          </span>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            title={t("ui.incidentReporter.expand")}
            aria-label={t("ui.incidentReporter.expand")}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setMinimized(false); }}
            title={t("ui.incidentThread.btnCancel")}
            aria-label={t("ui.incidentThread.btnCancel")}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Dialog open={open && !minimized} onOpenChange={handleOpenChange}>
        {/* z-[130] > backdrop/panel del foro (109/110): permite comunicar
            incidencias con el drawer de Comunidad abierto (#593). */}
        <DialogContent className="max-w-2xl z-[130]" overlayClassName="z-[129]">
          {/* #306 — minimizar a una barra para echar un vistazo a la pantalla. */}
          <button
            type="button"
            onClick={() => { minimizeRef.current = true; setMinimized(true); }}
            title={t("ui.incidentReporter.minimize")}
            aria-label={t("ui.incidentReporter.minimize")}
            className="absolute right-12 top-4 rounded-sm p-0.5 text-gray-500 opacity-70 transition-opacity hover:bg-gray-100 hover:opacity-100 focus:outline-none"
          >
            <Minus className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle>
              {kind === null ? t("ui.incidentReporter.chooseTitle") : headerTitle}
            </DialogTitle>
            <DialogDescription>
              {kind === null ? t("ui.incidentReporter.chooseDescription") : headerDescription}
            </DialogDescription>
          </DialogHeader>

          {/* Paso 1 — elección incidencia vs propuesta de mejora. Misma
              pantalla a continuación, solo cambia el lenguaje. */}
          {kind === null && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setKind("incident")}
                className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-navy hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Bug className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("ui.incidentReporter.chooseIncident")}
                </span>
                <span className="text-xs text-gray-500">
                  {t("ui.incidentReporter.chooseIncidentHint")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setKind("improvement")}
                className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-navy hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                  <Lightbulb className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("ui.incidentReporter.chooseImprovement")}
                </span>
                <span className="text-xs text-gray-500">
                  {t("ui.incidentReporter.chooseImprovementHint")}
                </span>
              </button>
            </div>
          )}

          {kind !== null && (
          <div className="space-y-4">
            {/* Screenshot preview */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
              {capturing && (
                <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("ui.incidentReporter.capturing")}
                </div>
              )}
              {!capturing && screenshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={screenshot}
                  alt={t("ui.incidentReporter.screenshotAlt")}
                  className="max-h-60 w-full rounded-md object-contain"
                />
              )}
              {!capturing && !screenshot && (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-gray-500">
                  <Camera className="h-5 w-5" />
                  <span>{t("ui.incidentReporter.captureFailed")}</span>
                  {captureError && (
                    <span className="max-w-xs truncate text-[11px] text-gray-400" title={captureError}>
                      {captureError}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={captureScreenshot}
                    className="text-cyan hover:underline"
                  >
                    {t("ui.incidentReporter.retry")}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="incident-description" className="mb-1 block text-sm text-gray-700">
                {descLabel}
              </label>
              <Textarea
                id="incident-description"
                value={description}
                onChange={(e) => updateDescription(e.target.value)}
                placeholder={descPlaceholder}
                rows={5}
                // #429 — tope alineado con el backend (evita que el envío falle
                // silenciosamente por longitud; antes eran 4000 y truncaba).
                maxLength={20000}
                autoFocus
              />
            </div>

            {/* #162 — adjuntos aportados por el usuario (imágenes, PDF…). */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm text-gray-700">
                  {t("ui.incidentReporter.attachmentsLabel")}
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t("ui.incidentReporter.attachBtn")}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {attachments.length === 0 ? (
                <p className="text-xs text-gray-400">{t("ui.incidentReporter.attachHint", { max: MAX_ATTACHMENTS })}</p>
              ) : (
                <ul className="space-y-1">
                  {attachments.map((a, idx) => (
                    <li
                      key={`${a.filename}-${idx}`}
                      className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-gray-700">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate">{a.filename}</span>
                        <span className="shrink-0 text-gray-400">
                          {a.sizeBytes < 1024 * 1024
                            ? `${(a.sizeBytes / 1024).toFixed(0)} KB`
                            : `${(a.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        aria-label={t("ui.incidentThread.btnCancel")}
                        className="ml-2 shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {attachError && <p className="mt-1 text-xs text-red-500">{attachError}</p>}
            </div>

            <p className="text-xs text-gray-500">
              {t("ui.incidentReporter.privacyHint")}
            </p>

            {result === "ok" && (
              <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                {sentOkLabel}
              </div>
            )}
            {result === "error" && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage || t("ui.incidentReporter.errSendShort")}
              </div>
            )}
          </div>
          )}

          <DialogFooter>
            {kind !== null && (
              // Volver al paso de elección sin perder lo escrito.
              <Button
                variant="outline"
                onClick={() => { setKind(null); setResult(null); setErrorMessage(""); }}
                disabled={submitting}
                className="sm:mr-auto"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("ui.incidentReporter.btnBack")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              <X className="mr-1 h-4 w-4" />
              {t("ui.incidentThread.btnCancel")}
            </Button>
            {kind !== null && (
              <Button onClick={submit} disabled={submitting || capturing || !description.trim()}>
                {submitting ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t("ui.forgotPassword.sending")}</>
                ) : (
                  <><Send className="mr-1 h-4 w-4" />{sendLabel}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
