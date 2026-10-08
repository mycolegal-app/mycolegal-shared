"use client";

// Botón 🔊 «Escuchar» de una respuesta de MycoBot (F7 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md).
// Pulsar lee la respuesta en voz alta; pulsar otra vez (⏹) la para. Si la app no tiene montada la ruta
// `/api/tts`, o la voz no está disponible en platform, no se pinta.
//
// El ▾ de al lado abre la lista corta de voces (F7b): cada usuario elige la suya, con un ▶ para oír una frase de
// muestra antes. La elección se guarda en platform y vale en todas las apps y en Telegram.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Play, Square, Volume2 } from "lucide-react";
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

/** Idioma de la interfaz (CAST/CAT/GAL/EUS) → idioma de la muestra. */
const MUESTRA: Record<string, string> = { CAST: "es", CAT: "ca", GAL: "gl", EUS: "eu" };

export function BotonEscuchar({ texto, idioma, url, contexto, onAviso, className }: BotonEscucharProps) {
  const { t, language } = useI18n();
  const v = useVoz({ url, contexto, onError: () => onAviso?.(t("ui.voz.error")) });
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);

  // Se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  if (!v.disponible) return null;

  const activo = v.estado !== "inactivo";
  const etiqueta = v.estado === "preparando" ? t("ui.voz.preparando") : activo ? t("ui.voz.parar") : t("ui.voz.escuchar");
  const idiomaMuestra = idioma || MUESTRA[language] || "es";

  return (
    <span ref={caja} className="relative inline-flex items-center">
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
      {v.voces.length > 1 && (
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-label={t("ui.voz.elegir")}
          title={t("ui.voz.elegir")}
          aria-expanded={abierto}
          className="ml-0.5 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
      {abierto && (
        <span
          role="listbox"
          aria-label={t("ui.voz.elegir")}
          className="absolute bottom-full right-0 z-50 mb-1 w-56 rounded-md border bg-white p-1 text-[12px] shadow-lg"
        >
          <span className="block px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            {t("ui.voz.elegir")}
          </span>
          {v.voces.map((op) => {
            const elegida = op.id === v.voz;
            return (
              <span key={op.id} className="flex items-center gap-1 rounded hover:bg-gray-50">
                <button
                  type="button"
                  role="option"
                  aria-selected={elegida}
                  onClick={() => { void v.elegirVoz(op.id); setAbierto(false); }}
                  className={cn("flex flex-1 items-center gap-1.5 px-2 py-1.5 text-left", elegida ? "font-medium text-gray-900" : "text-gray-600")}
                >
                  <Check className={cn("h-3 w-3 shrink-0", elegida ? "opacity-100" : "opacity-0")} />
                  {t(`ui.voz.voces.${op.id}`)}
                </button>
                <button
                  type="button"
                  onClick={() => v.oirMuestra(op.id, idiomaMuestra)}
                  aria-label={t("ui.voz.muestra")}
                  title={t("ui.voz.muestra")}
                  className="mr-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Play className="h-3 w-3 fill-current" />
                </button>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
