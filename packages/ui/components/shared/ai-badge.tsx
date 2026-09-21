"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

// PLAN_TECNICO_IA_RESPONSABLE §3 — identificación de una salida de IA.
//
// Pinta el `AiTrace` que Consultor adjunta a cada respuesta de MycoBot y a cada
// informe generado (Revisor, Descripción, resúmenes, casado): con qué modelo se
// redactó, dónde reside, qué versión de instrucciones regía, qué contexto usó y
// cuántas fuentes cita. Es lo que el Código Deontológico del CGN llama "conocer
// la versión del sistema utilizada" (art. 21 f).
//
// Dos modos, decididos por Carles (21-sep-2026):
//   · `hover` (rail de MycoBot): un punto ámbar de 6 px; la píldora aparece al
//     pasar el ratón o enfocar. Sin texto permanente para no saturar el chat.
//   · `fixed` (informes): línea gris discreta al pie, para que quien lo quiera
//     citar la tenga a la vista y salga en la impresión.
// En ambos, "¿Qué significa?" abre el panel de uso de la IA en la ficha de esa
// función (evento `mycolegal:open-ai-panel`, que escucha <AiUsagePanel>).

/** Réplica del `AiTrace` de consultor (`src/lib/ia/trace.ts`). Si cambia allí, cambia aquí. */
export interface AiTrace {
  funcion: string;
  modelo: string;
  eu: boolean | null;
  instruccionesVersion: string;
  contexto: string[];
  fuentes: number;
  generadoEn: string;
}

export interface AiBadgeProps {
  trace?: AiTrace | null;
  mode?: "hover" | "fixed";
  className?: string;
}

const CONTEXTO_KEY: Record<string, string> = {
  corpus: "ui.ai.ctx.corpus",
  ayuda: "ui.ai.ctx.ayuda",
  normativa: "ui.ai.ctx.normativa",
  datos_despacho: "ui.ai.ctx.datos",
  documento: "ui.ai.ctx.documento",
  conocimiento_general: "ui.ai.ctx.general",
};

/** Texto de la píldora: "gemini-3.7-flash (UE) · corpus + datos del despacho · 4 fuentes". */
export function describeTrace(trace: AiTrace, t: (k: string, vars?: Record<string, string | number>) => string): string {
  const residencia = trace.eu === true ? t("ui.ai.eu") : trace.eu === false ? t("ui.ai.nonEu") : t("ui.ai.euUnknown");
  const ctx = trace.contexto.map((c) => t(CONTEXTO_KEY[c] ?? c)).join(" + ");
  const fuentes = trace.fuentes === 1 ? t("ui.ai.oneSource") : t("ui.ai.sources", { n: trace.fuentes });
  return `${trace.modelo} (${residencia}) · ${ctx} · ${fuentes}`;
}

export function AiBadge({ trace, mode = "hover", className = "" }: AiBadgeProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!trace?.modelo) return null;

  const texto = describeTrace(trace, t);
  const fecha = trace.generadoEn ? new Date(trace.generadoEn).toLocaleString() : "";
  const abrirPanel = () =>
    window.dispatchEvent(new CustomEvent("mycolegal:open-ai-panel", { detail: { funcion: trace.funcion } }));

  if (mode === "fixed") {
    return (
      <div className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-100 pt-2 text-[11px] text-gray-400 print:text-gray-600 ${className}`}>
        <Sparkles className="h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
        <span>
          {t("ui.ai.generatedWith")} · {texto} · {t("ui.ai.instructions")} v{trace.instruccionesVersion}
          {fecha ? ` · ${fecha}` : ""}
        </span>
        <button type="button" onClick={abrirPanel} className="text-cyan-700 hover:underline print:hidden">
          {t("ui.ai.whatIsThis")}
        </button>
      </div>
    );
  }

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        aria-label={`${t("ui.ai.generatedWith")} · ${texto}`}
        className="grid h-4 w-4 place-items-center rounded-full"
      >
        <span className="block h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-amber-100" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full right-0 z-30 mb-1 w-max max-w-[260px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] leading-snug text-gray-600 shadow-lg"
        >
          <span className="flex items-center gap-1 font-semibold text-gray-700">
            <Sparkles className="h-3 w-3 text-amber-500" aria-hidden="true" />
            {t("ui.ai.generatedWith")}
          </span>
          <span className="block">{texto}</span>
          <span className="block text-gray-400">
            {t("ui.ai.instructions")} v{trace.instruccionesVersion}
          </span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={abrirPanel} className="mt-0.5 text-cyan-700 hover:underline">
            {t("ui.ai.whatIsThis")}
          </button>
        </span>
      )}
    </span>
  );
}
