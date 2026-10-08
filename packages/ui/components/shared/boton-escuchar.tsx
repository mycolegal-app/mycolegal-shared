"use client";

// Botón 🔊 «Escuchar» de una respuesta de MycoBot (F7 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md).
// Pulsar lee la respuesta en voz alta; pulsar otra vez (⏹) la para. Si la app no tiene montada la ruta
// `/api/tts`, o la voz no está disponible en platform, no se pinta.

import { Loader2, Square, Volume2 } from "lucide-react";
import { useVoz } from "../../hooks/use-voz";
import { useI18n } from "../i18n/i18n-context";
import { cn } from "../../lib/utils";

export interface BotonEscucharProps {
  /** La respuesta tal cual (markdown): platform la limpia y la acota. */
  texto: string;
  /** Idioma de la respuesta (el que decidió MycoBot). Sin él, el motor detecta el del texto. */
  idioma?: string | null;
  url?: string;
  contexto?: string;
  /** Aviso para mostrar al usuario (texto ya traducido), o null para quitarlo. */
  onAviso?: (mensaje: string | null) => void;
  className?: string;
}

export function BotonEscuchar({ texto, idioma, url, contexto, onAviso, className }: BotonEscucharProps) {
  const { t } = useI18n();
  const v = useVoz({ url, contexto, onError: () => onAviso?.(t("ui.voz.error")) });
  if (!v.disponible) return null;

  const activo = v.estado !== "inactivo";
  const etiqueta = v.estado === "preparando" ? t("ui.voz.preparando") : activo ? t("ui.voz.parar") : t("ui.voz.escuchar");

  return (
    <button
      type="button"
      onClick={() => {
        if (activo) { v.parar(); return; }
        onAviso?.(null);
        void v.escuchar(texto, idioma);
      }}
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activo}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700",
        activo && "text-[var(--accent,#b8860b)]",
        className,
      )}
    >
      {v.estado === "preparando" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : v.estado === "sonando" ? (
        <Square className="h-3 w-3 fill-current" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      <span>{v.estado === "sonando" ? t("ui.voz.parar") : t("ui.voz.escuchar")}</span>
    </button>
  );
}
