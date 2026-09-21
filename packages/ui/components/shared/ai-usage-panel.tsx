"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, X, Check, ChevronDown, ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

// PLAN_TECNICO_IA_RESPONSABLE §2 — "Uso de la inteligencia artificial" en el
// centro de ayuda `(?)`. Es la ficha de sistema del art. 8 y 21 del Código
// Deontológico del CGN, DENTRO de la aplicación: tres compromisos fijos y una
// ficha por función de IA ofrecida en esta app, leída del endpoint
// `/api/resoluciones/fichas-ia` (Consultor cruza el catálogo de funciones con el
// modelo y las instrucciones EN VIGOR en Admin). Mismo patrón modal que el panel
// de privacidad del HelpMenu.
//
// Fail-soft: si el endpoint no responde (app sin proxy a Consultor, red caída),
// se enseñan los compromisos fijos y el enlace a la Declaración; nunca un error.
//
// Se abre desde el HelpMenu (prop `open`) y desde cualquier <AiBadge> vía el
// evento `mycolegal:open-ai-panel` (detail.funcion = ficha a desplegar).

export interface FichaIA {
  key: string;
  titulo: string;
  finalidad: string;
  usoAdmisible: string;
  datos: string;
  autonomia: string;
  supervision: string;
  interna: boolean;
  modelos: { taskKey: string; label: string; model: string; eu: boolean | null }[];
  modeloPrincipal: string;
  modeloPorDefecto: boolean;
  instruccionesVersion: string;
  prompts: number;
  actualizadoEn: string | null;
}

export interface AiUsagePanelProps {
  open: boolean;
  onClose: () => void;
  /** App actual: filtra las fichas a las funciones que se ofrecen aquí. */
  appSlug?: string;
  /** Base del proxy a Consultor (por defecto `/api/resoluciones`). */
  apiBase?: string;
  /** Enlace a la Declaración completa (landing). */
  declaracionHref?: string;
  /** Enlace a la plantilla de política interna (landing). */
  plantillaHref?: string;
}

export function AiUsagePanel({
  open,
  onClose,
  appSlug,
  apiBase = "/api/resoluciones",
  declaracionHref = "https://mycolegal.app/legal/ia-responsable",
  plantillaHref = "https://mycolegal.app/docs/Plantilla-Politica-Interna-IA.pdf",
}: AiUsagePanelProps) {
  const { t, language } = useI18n();
  const [fichas, setFichas] = useState<FichaIA[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (appSlug) qs.set("app", appSlug);
      qs.set("lang", language);
      const res = await fetch(`${apiBase}/fichas-ia?${qs.toString()}`);
      const json = await res.json().catch(() => ({}));
      setFichas(res.ok && Array.isArray(json.data) ? json.data : []);
    } catch {
      setFichas([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, appSlug, language]);

  useEffect(() => {
    if (open && fichas === null) void cargar();
  }, [open, fichas, cargar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Un <AiBadge> pide abrir el panel en su función: el HelpMenu (que es quien
  // controla `open`) escucha el mismo evento; aquí solo fijamos qué ficha se
  // despliega.
  useEffect(() => {
    const handler = (e: Event) => {
      const funcion = (e as CustomEvent<{ funcion?: string }>).detail?.funcion;
      if (funcion) setAbierta(funcion);
    };
    window.addEventListener("mycolegal:open-ai-panel", handler);
    return () => window.removeEventListener("mycolegal:open-ai-panel", handler);
  }, []);

  if (!open) return null;

  const href = declaracionHref.includes("?") ? declaracionHref : `${declaracionHref}?lang=${language}`;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-usage-title"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pb-1 pt-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 id="ai-usage-title" className="flex-1 text-[15px] font-bold tracking-tight text-gray-900">
            {t("ui.ai.panel.title")}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600" aria-label={t("ui.ai.panel.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-4">
          <ul className="flex flex-col gap-2 py-3 text-[13.5px] text-gray-600">
            {["ui.ai.panel.auxiliar", "ui.ai.panel.contrastable", "ui.ai.panel.ue"].map((k) => (
              <li key={k} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t("ui.ai.panel.fichas")}</h3>

          {loading && (
            <div className="mt-2 space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          )}
          {!loading && fichas && fichas.length === 0 && (
            <p className="mt-2 text-[13px] text-gray-500">{t("ui.ai.panel.noFichas")}</p>
          )}
          {!loading && fichas && fichas.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {fichas.map((f) => {
                const isOpen = abierta === f.key;
                return (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => setAbierta(isOpen ? null : f.key)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-gray-800 hover:bg-gray-50"
                    >
                      <span className="flex-1">{f.titulo}</span>
                      {f.interna && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-500">{t("ui.ai.panel.interna")}</span>}
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 border-t border-gray-100 bg-gray-50/60 px-3 py-3 text-[12.5px] text-gray-600">
                        <Campo label={t("ui.ai.panel.finalidad")}>{f.finalidad}</Campo>
                        <Campo label={t("ui.ai.panel.usoAdmisible")}>{t("ui.ai.panel.art3", { letras: f.usoAdmisible })}</Campo>
                        <Campo label={t("ui.ai.panel.datos")}>{f.datos}</Campo>
                        <Campo label={t("ui.ai.panel.autonomia")}>{f.autonomia}</Campo>
                        <Campo label={t("ui.ai.panel.supervision")}>{f.supervision}</Campo>
                        <Campo label={t("ui.ai.panel.modelo")}>
                          {f.modeloPorDefecto ? (
                            <span>{f.modeloPrincipal} · {t("ui.ai.panel.modeloDefecto")}</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {f.modelos.map((m) => (
                                <li key={m.taskKey} className="flex flex-wrap items-center gap-1.5">
                                  <code className="rounded bg-white px-1 text-[11.5px] text-gray-700">{m.model}</code>
                                  <EuBadge eu={m.eu} t={t} />
                                  <span className="text-gray-400">· {m.label}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Campo>
                        <Campo label={t("ui.ai.panel.version")}>
                          <code className="rounded bg-white px-1 text-[11.5px] text-gray-700">v{f.instruccionesVersion}</code>
                          <span className="text-gray-400"> · {t("ui.ai.panel.prompts", { n: f.prompts })}</span>
                        </Campo>
                        <Campo label={t("ui.ai.panel.actualizado")}>
                          {f.actualizadoEn ? new Date(f.actualizadoEn).toLocaleDateString() : "—"}
                        </Campo>
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-5 py-3">
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-cyan-700 hover:underline">
            {t("ui.ai.panel.declaracion")} <ExternalLink className="h-3 w-3" />
          </a>
          <a href={plantillaHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-gray-600 hover:underline">
            {t("ui.ai.panel.plantilla")} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-gray-500">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function EuBadge({ eu, t }: { eu: boolean | null; t: (k: string) => string }) {
  if (eu === true) return <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">{t("ui.ai.eu")}</span>;
  if (eu === false) return <span className="rounded bg-red-50 px-1 py-0.5 text-[10px] font-semibold text-red-700">{t("ui.ai.nonEu")}</span>;
  return <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">{t("ui.ai.euUnknown")}</span>;
}
