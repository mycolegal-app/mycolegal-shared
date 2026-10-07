"use client";

// Botón 🎤 de dictado (F2 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md). Lo usan el rail de
// MycoBot y cualquier caja de texto que quiera dictado (Redactor). Pulsar para empezar, pulsar
// para parar; Escape cancela. Si el navegador no puede grabar, o la app aún no tiene montada la
// ruta `/api/transcribe`, no se pinta. El texto llega por `onTexto` y no se envía solo (D3).

import { useEffect } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useDictado, type AvisoDictado } from "../../hooks/use-dictado";
import { useI18n } from "../i18n/i18n-context";
import { cn } from "../../lib/utils";

export interface BotonDictadoProps {
  onTexto: (texto: string) => void;
  /** Aviso para mostrar al usuario (texto ya traducido), o null para quitarlo. */
  onAviso?: (mensaje: string | null) => void;
  url?: string;
  contexto?: string;
  disabled?: boolean;
  className?: string;
}

export function BotonDictado({ onTexto, onAviso, url, contexto, disabled, className }: BotonDictadoProps) {
  const { t, language } = useI18n();
  const d = useDictado({
    url,
    idioma: language,
    contexto,
    onTexto,
    onAviso: (a: AvisoDictado | null) => onAviso?.(a ? t(`ui.dictado.${a}`) : null),
  });

  // Escape cancela la grabación sin enviar nada.
  useEffect(() => {
    if (d.estado !== "grabando") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") d.cancelar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d.estado, d.cancelar]);

  if (!d.disponible) return null;

  const grabando = d.estado === "grabando";
  const ocupado = d.estado === "transcribiendo" || d.estado === "pidiendo-permiso";
  const mmss = `${Math.floor(d.segundos / 60)}:${String(d.segundos % 60).padStart(2, "0")}`;
  const etiqueta = grabando
    ? t("ui.dictado.parar")
    : d.estado === "transcribiendo" ? t("ui.dictado.transcribiendo") : t("ui.dictado.empezar");

  return (
    <button
      type="button"
      onClick={() => (grabando ? d.parar() : void d.empezar())}
      disabled={(disabled && !grabando) || ocupado}
      aria-label={etiqueta}
      title={grabando ? `${etiqueta} · ${t("ui.dictado.escapeCancela")}` : etiqueta}
      aria-pressed={grabando}
      className={cn(
        "flex h-9 shrink-0 items-center justify-center gap-1 rounded-md border text-gray-500 hover:bg-gray-50 disabled:opacity-40",
        grabando ? "w-auto border-red-300 bg-red-50 px-2 text-red-600 hover:bg-red-100" : "w-9",
        className,
      )}
    >
      {ocupado ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : grabando ? (
        <>
          <Square className="h-3.5 w-3.5 animate-pulse fill-current" />
          <span className="font-mono text-[11px] tabular-nums">{mmss}</span>
        </>
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </button>
  );
}
