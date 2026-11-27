"use client";

// Editor de plantillas de documento en sintaxis DocFilling (LegiFirma, Pólizas).
// PLAN_TECNICO_PLANTILLAS_DOCFILLING_APPS (mycolegal-shared), F4 en su versión de lanzamiento.
//
// Lo monta `DocumentTemplatesManager` cuando la plantilla viene con `bodyFormat: 'DOCFILLING'`.
//
// TEXTO PLANO, A PROPÓSITO. El `MarkdownEditor` (TipTap ↔ markdown) estropea la sintaxis: devuelve
// `{{TIPO\_DOC}}` y pega las líneas de `{{IF}}`/`{{ENDIF}}` al párrafo de al lado (medido el 16-nov). Aquí la
// notaría ve y edita exactamente lo que se guarda. El editor con resaltado (CodeMirror) llegará después del
// lanzamiento y sustituirá el área de texto sin cambiar el contrato con la API.
//
// Contrato con la API de la app (`endpoint`, p. ej. `/api/admin/document-templates`):
//   PATCH  /{eventKey}            { bodyHtml }           → 422 { error, diagnostics } si hay errores
//   DELETE /{eventKey}                                    → vuelve al texto por defecto
//   POST   /preview               { eventKey, bodyHtml, formato: 'texto' } → { data: { markdown, diagnostics, faltan } }
//   POST   /preview               { …, formato: 'docx' }  → el Word de prueba
//   GET|PUT|DELETE /{eventKey}/membrete  (PUT multipart `fichero`) → el Word de membrete de esa plantilla

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Trash2, Upload } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

export interface CampoDocFilling {
  key: string;
  label: string;
  example: string;
  tipo?: "dato" | "control" | "lista";
  subcampos?: { key: string; label: string; example: string }[];
  valores?: string[];
}

export interface CampoNotariaDocFilling {
  key: string;
  label: string;
  dondeSeRellena: string;
  /** Valor actual en Config ('' si falta). */
  valor: string;
}

export interface MembreteDocFilling {
  nombre: string;
  tamanoBytes: number;
  updatedAt: string;
  validacion?: { hallazgos?: { nivel: "error" | "aviso"; mensaje: string }[] };
}

export interface PlantillaDocFilling {
  eventKey: string;
  label: string;
  description: string | null;
  macros: CampoDocFilling[];
  defaultBody: string;
  body: string | null;
  camposNotaria?: CampoNotariaDocFilling[];
  membrete?: MembreteDocFilling | null;
}

interface Diagnostico {
  line: number;
  col: number;
  severity: "error" | "warning";
  code: string;
  message: string;
}

interface DatoQueFalta {
  key: string;
  label: string;
  dondeSeRellena: string;
}

export interface DocFillingTemplateEditorProps {
  plantilla: PlantillaDocFilling;
  endpoint: string;
  onToast?: (message: string, kind: "success" | "error") => void;
  /** Tras guardar, restaurar o cambiar el membrete: la lista se vuelve a pedir. */
  onChanged: () => void | Promise<void>;
  /** Idioma del modelo que se edita (Pólizas, #653): viaja en el guardado, la vista previa y el restaurar.
   *  El membrete NO es por idioma: es uno por plantilla. */
  idioma?: string;
  /** Sin permiso de escritura: se ve y se comprueba, pero no se guarda ni se cambia el membrete. */
  soloLectura?: boolean;
  /** Avisa de si hay cambios sin guardar (p. ej. para confirmar antes de cambiar de idioma). */
  onSucio?: (sucio: boolean) => void;
}

/** Los estilos de la carta genérica. Una notaría con su propio Word puede usar los suyos escribiéndolos a mano. */
const ESTILOS = ["Datos de la notaría", "Firma", "Texto legal"];

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** El texto compuesto, para leer en pantalla: sin las directivas de estilo y sin escapes de markdown. */
function paraLeer(markdown: string): string {
  return markdown
    .replace(/\{\{\s*WORD_STYLE\s*:[^}]*\}\}/gi, "")
    .replace(/\{\{\s*PAGEBREAK\s*\}\}/gi, "\n— — —\n")
    .replace(/\\([\\`*_{}[\]()#+\-!|])/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function DocFillingTemplateEditor({ plantilla, endpoint, onToast, onChanged, idioma, soloLectura = false, onSucio }: DocFillingTemplateEditorProps) {
  const { t } = useI18n();
  const base = `${endpoint}/${encodeURIComponent(plantilla.eventKey)}`;
  const conIdioma = idioma ? { idioma } : {};
  const qsIdioma = idioma ? `?idioma=${encodeURIComponent(idioma)}` : "";
  const original = plantilla.body ?? plantilla.defaultBody;
  const [texto, setTexto] = useState(original);
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[] | null>(null);
  const [faltan, setFaltan] = useState<DatoQueFalta[]>([]);
  const [vista, setVista] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "comprobar" | "guardar" | "word" | "restaurar" | "membrete">(null);
  const [hallazgosMembrete, setHallazgosMembrete] = useState<{ nivel: string; mensaje: string }[] | null>(null);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const fichero = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTexto(plantilla.body ?? plantilla.defaultBody);
    setDiagnosticos(null);
    setFaltan([]);
    setVista(null);
    setHallazgosMembrete(null);
  }, [plantilla.eventKey, plantilla.body, plantilla.defaultBody]);

  const sucio = texto !== original;
  useEffect(() => {
    onSucio?.(sucio);
  }, [sucio, onSucio]);
  const errores = useMemo(() => (diagnosticos ?? []).filter((d) => d.severity === "error"), [diagnosticos]);

  function insertar(token: string) {
    if (soloLectura) return;
    const el = ta.current;
    if (!el) {
      setTexto((p) => p + token);
      return;
    }
    const ini = el.selectionStart ?? texto.length;
    const fin = el.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + token + texto.slice(fin));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + token.length, ini + token.length);
    });
  }

  function irALinea(line: number, col: number) {
    const el = ta.current;
    if (!el) return;
    const lineas = texto.split("\n");
    const pos = lineas.slice(0, Math.max(0, line - 1)).reduce((n, l) => n + l.length + 1, 0) + Math.max(0, col - 1);
    el.focus();
    el.setSelectionRange(pos, pos);
  }

  function tokenDeCampo(c: CampoDocFilling): string {
    if (c.tipo === "lista") {
      const subs = (c.subcampos ?? []).map((s) => `{{ITEM.${s.key}}}`).join(", ");
      return `{{FOR EACH ITEM IN ${c.key}}}\n- ${subs}\n{{ENDFOR}}\n`;
    }
    if (c.tipo === "control" && c.valores?.length) {
      return `{{IF ${c.key} == '${c.valores[c.valores.length - 1]}'}}…{{ELSE}}…{{ENDIF}}`;
    }
    return `{{${c.key}}}`;
  }

  async function comprobar(): Promise<boolean> {
    setOcupado("comprobar");
    try {
      const res = await fetch(`${endpoint}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: plantilla.eventKey, bodyHtml: texto, formato: "texto", ...conIdioma }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDiagnosticos(json.data?.diagnostics ?? []);
        setFaltan(json.data?.faltan ?? []);
        setVista(paraLeer(json.data?.markdown ?? ""));
        return true;
      }
      setDiagnosticos(json.diagnostics ?? []);
      setVista(null);
      if (!json.diagnostics) onToast?.(json.error?.message ?? t("ui.documentTemplates.errPreview"), "error");
      return false;
    } catch {
      onToast?.(t("ui.documentTemplates.errPreview"), "error");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    setOcupado("guardar");
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml: texto, ...conIdioma }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDiagnosticos(json.data?.diagnostics ?? []);
        onToast?.(t("ui.documentTemplates.saved"), "success");
        await onChanged();
      } else {
        if (json.diagnostics) setDiagnosticos(json.diagnostics);
        onToast?.(json.error?.message ?? t("ui.documentTemplates.errSave"), "error");
      }
    } catch {
      onToast?.(t("ui.documentTemplates.errSave"), "error");
    } finally {
      setOcupado(null);
    }
  }

  async function wordDePrueba() {
    setOcupado("word");
    try {
      const res = await fetch(`${endpoint}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: plantilla.eventKey, bodyHtml: texto, formato: "docx", ...conIdioma }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.diagnostics) setDiagnosticos(json.diagnostics);
        onToast?.(json.error?.message ?? t("ui.documentTemplates.errPreview"), "error");
        return;
      }
      descargar(await res.blob(), `prueba-${plantilla.eventKey}.docx`);
    } catch {
      onToast?.(t("ui.documentTemplates.errPreview"), "error");
    } finally {
      setOcupado(null);
    }
  }

  async function restaurar() {
    setOcupado("restaurar");
    try {
      const res = await fetch(`${base}${qsIdioma}`, { method: "DELETE" });
      if (res.ok) {
        onToast?.(t("ui.documentTemplates.reset"), "success");
        await onChanged();
      } else {
        onToast?.(t("ui.documentTemplates.errReset"), "error");
      }
    } finally {
      setOcupado(null);
    }
  }

  async function subirMembrete(f: File) {
    setOcupado("membrete");
    setHallazgosMembrete(null);
    try {
      const fd = new FormData();
      fd.append("fichero", f);
      const res = await fetch(`${base}/membrete`, { method: "PUT", body: fd });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setHallazgosMembrete(json.data?.informe?.hallazgos ?? []);
        onToast?.(t("ui.documentTemplates.docfilling.membreteGuardado"), "success");
        await onChanged();
      } else {
        setHallazgosMembrete(json.informe?.hallazgos ?? null);
        onToast?.(json.error?.message ?? t("ui.documentTemplates.docfilling.errMembrete"), "error");
      }
    } catch {
      onToast?.(t("ui.documentTemplates.docfilling.errMembrete"), "error");
    } finally {
      setOcupado(null);
      if (fichero.current) fichero.current.value = "";
    }
  }

  async function quitarMembrete() {
    setOcupado("membrete");
    try {
      const res = await fetch(`${base}/membrete`, { method: "DELETE" });
      if (res.ok) {
        setHallazgosMembrete(null);
        onToast?.(t("ui.documentTemplates.docfilling.membreteQuitado"), "success");
        await onChanged();
      } else {
        onToast?.(t("ui.documentTemplates.docfilling.errMembrete"), "error");
      }
    } finally {
      setOcupado(null);
    }
  }

  const avisosMembrete =
    hallazgosMembrete ?? plantilla.membrete?.validacion?.hallazgos?.filter((h) => h.nivel === "aviso") ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-sm text-gray-800">{plantilla.label}</h4>
          {plantilla.description && <p className="mt-1 text-xs text-gray-500">{plantilla.description}</p>}
          <p className="mt-1 text-[10px] text-gray-500">
            {plantilla.body !== null ? t("ui.documentTemplates.usingOverride") : t("ui.documentTemplates.usingDefault")}
          </p>
        </div>
        {plantilla.body !== null && !soloLectura && (
          <button
            type="button"
            onClick={restaurar}
            disabled={ocupado !== null}
            className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50 whitespace-nowrap"
          >
            {t("ui.documentTemplates.resetBtn")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4">
        {/* Texto */}
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-gray-500 mr-1">{t("ui.documentTemplates.docfilling.insertar")}</span>
            <button type="button" className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50" onClick={() => insertar("{{IF CAMPO}}…{{ELSE}}…{{ENDIF}}")}>
              {t("ui.documentTemplates.docfilling.condicion")}
            </button>
            {ESTILOS.map((e) => (
              <button key={e} type="button" className="rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50" onClick={() => insertar(`{{WORD_STYLE:${e}}}`)}>
                {t("ui.documentTemplates.docfilling.estilo", { estilo: e })}
              </button>
            ))}
          </div>
          <textarea
            ref={ta}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            readOnly={soloLectura}
            spellCheck={false}
            className="w-full min-h-[420px] rounded border border-gray-200 bg-gray-50/50 p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan"
            aria-label={t("ui.documentTemplates.docfilling.textoLabel")}
          />
          <p className="text-[10px] text-gray-500">{t("ui.documentTemplates.docfilling.ayudaSintaxis")}</p>

          {diagnosticos && (
            <div className={`rounded border p-2 text-xs ${errores.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
              {diagnosticos.length === 0 ? (
                <p className="flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {t("ui.documentTemplates.docfilling.sinErrores")}
                </p>
              ) : (
                <ul className="space-y-1">
                  {diagnosticos.map((d, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => irALinea(d.line, d.col)}
                        className={`text-left hover:underline ${d.severity === "error" ? "text-red-800" : "text-amber-800"}`}
                      >
                        {t("ui.documentTemplates.docfilling.linea", { linea: String(d.line) })}: {d.message}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {faltan.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> {t("ui.documentTemplates.docfilling.faltanTitulo")}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {faltan.map((f) => (
                  <li key={f.key}>
                    {f.label}: {f.dondeSeRellena}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vista !== null && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                {t("ui.documentTemplates.docfilling.vistaTitulo")}
              </p>
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-3 font-serif text-[13px] leading-relaxed text-gray-800">
                {vista}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={comprobar}
              disabled={ocupado !== null}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {ocupado === "comprobar" ? t("ui.documentTemplates.docfilling.comprobando") : t("ui.documentTemplates.docfilling.comprobar")}
            </button>
            <button
              type="button"
              onClick={wordDePrueba}
              disabled={ocupado !== null}
              className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {ocupado === "word" ? t("ui.documentTemplates.previewLoading") : t("ui.documentTemplates.docfilling.wordPrueba")}
            </button>
            <div className="flex-1" />
            {sucio && (
              <button type="button" onClick={() => setTexto(original)} disabled={ocupado !== null} className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50">
                {t("ui.documentTemplates.btnCancel")}
              </button>
            )}
            <button
              type="button"
              onClick={guardar}
              hidden={soloLectura}
              disabled={!sucio || ocupado !== null || soloLectura}
              className="rounded bg-cyan px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {ocupado === "guardar" ? t("ui.documentTemplates.saving") : t("ui.documentTemplates.saveBtn")}
            </button>
          </div>
        </div>

        {/* Paleta + membrete */}
        <aside className="space-y-4 text-xs">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              {t("ui.documentTemplates.docfilling.datosDocumento")}
            </p>
            <ul className="space-y-0.5">
              {plantilla.macros.map((c) => (
                <li key={c.key}>
                  <button type="button" onClick={() => insertar(tokenDeCampo(c))} className="w-full text-left rounded px-1.5 py-1 hover:bg-gray-50" title={c.example ? `${c.label} — ${c.example}` : c.label}>
                    <span className="font-mono text-[11px] text-gray-800">{c.tipo === "lista" ? `FOR EACH ${c.key}` : c.key}</span>
                    <span className="block text-[10px] text-gray-500 leading-tight">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {plantilla.camposNotaria && plantilla.camposNotaria.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                {t("ui.documentTemplates.docfilling.datosNotaria")}
              </p>
              <ul className="space-y-0.5">
                {plantilla.camposNotaria.map((c) => (
                  <li key={c.key}>
                    <button type="button" onClick={() => insertar(`{{SYSTEM:${c.key}}}`)} className="w-full text-left rounded px-1.5 py-1 hover:bg-gray-50" title={c.dondeSeRellena}>
                      <span className="font-mono text-[11px] text-gray-800">SYSTEM:{c.key}</span>
                      <span className={`block text-[10px] leading-tight ${c.valor ? "text-gray-600" : "text-amber-700"}`}>
                        {c.valor || t("ui.documentTemplates.docfilling.falta", { donde: c.dondeSeRellena })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded border border-gray-200 p-2 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {t("ui.documentTemplates.docfilling.membrete")}
            </p>
            {plantilla.membrete ? (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-gray-700">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <a href={`${base}/membrete`} className="truncate hover:underline">{plantilla.membrete.nombre}</a>
                </p>
                <button type="button" onClick={quitarMembrete} hidden={soloLectura} disabled={ocupado !== null || soloLectura} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-700 disabled:opacity-50">
                  <Trash2 className="h-3 w-3" /> {t("ui.documentTemplates.docfilling.quitarMembrete")}
                </button>
              </div>
            ) : (
              <p className="text-gray-500">{t("ui.documentTemplates.docfilling.sinMembrete")}</p>
            )}
            <input
              ref={fichero}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirMembrete(f);
              }}
            />
            <button
              type="button"
              onClick={() => fichero.current?.click()}
              hidden={soloLectura}
              disabled={ocupado !== null || soloLectura}
              className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              {ocupado === "membrete"
                ? t("ui.documentTemplates.docfilling.subiendo")
                : plantilla.membrete
                  ? t("ui.documentTemplates.docfilling.sustituirMembrete")
                  : t("ui.documentTemplates.docfilling.subirMembrete")}
            </button>
            {avisosMembrete.length > 0 && (
              <ul className="list-disc pl-4 text-[10px] text-amber-800">
                {avisosMembrete.map((h, i) => (
                  <li key={i}>{h.mensaje}</li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-gray-500 leading-snug">{t("ui.documentTemplates.docfilling.ayudaMembrete")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
