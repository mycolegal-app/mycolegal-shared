"use client";

import { useEffect, useState } from "react";
import { PlayCircle, X, Presentation, ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

// #904 — Javier: "también deberían estar accesibles los vídeos desde la app".
//
// Había nueve tutoriales publicados y ni una puerta: el visor sabía enseñar UNO
// por su id, pero no existía índice ni enlace en ninguna parte. Se llegaba solo
// si MycoBot te proponía uno en el chat.
//
// El panel se abre desde el «?» del toolbar, que es el sitio donde ya viven el
// Manual, la introducción y el resto de la ayuda, y por tanto sirve a todas las
// apps sin que ninguna tenga que montar una pantalla propia. Los datos salen de
// platform (dueña del catálogo) a través del reenviador `/api/tutoriales`.

export interface TutorialItem {
  id: string;
  titulo: string;
  descripcion: string | null;
  appSlug: string | null;
  tipo: string; // 'YOUTUBE' | 'SLIDES'
  youtubeUrl: string | null;
  nSlides: number | null;
}

/** ID del vídeo en una URL de YouTube: `?v=`, `youtu.be/`, `/embed/` y Shorts.
 *
 *  Los Shorts son la razón de que esto viva aquí y no copiado en cada sitio:
 *  el extractor del visor no los contemplaba y la «Invitación de Javier Micó»
 *  —cargada como Short— no daba ni vídeo ni miniatura (#904). */
export function ytVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    const partes = u.pathname.split("/").filter(Boolean);
    const iShorts = partes.indexOf("shorts");
    if (iShorts >= 0) return partes[iShorts + 1] ?? null;
    const iEmbed = partes.indexOf("embed");
    if (iEmbed >= 0) return partes[iEmbed + 1] ?? null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

/** Miniatura del vídeo. `hqdefault` existe para todos los vídeos, también Shorts. */
export function ytThumbnail(url: string | null | undefined): string | null {
  const id = ytVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lista ya cargada por el menú (evita pedirla dos veces). */
  items: TutorialItem[];
}

export function TutorialesPanel({ open, onClose, items }: Props) {
  const { t } = useI18n();
  const [fallidas, setFallidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/55 p-4 backdrop-blur-[2px] sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("ui.tutoriales.titulo")}
        className="w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
          <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">{t("ui.tutoriales.titulo")}</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">{t("ui.tutoriales.subtitulo")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ui.tutoriales.cerrar")}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">{t("ui.tutoriales.vacio")}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((tu) => {
                const esVideo = tu.tipo === "YOUTUBE";
                // Los de presentación no pueden abrirse en YouTube: van al
                // visor de diapositivas, que es donde viven.
                const href = esVideo && tu.youtubeUrl ? tu.youtubeUrl : `/tutoriales/${tu.id}`;
                const thumb = esVideo ? ytThumbnail(tu.youtubeUrl) : `/api/tutoriales/${tu.id}/slide/0`;
                const sinThumb = !thumb || fallidas.has(tu.id);
                return (
                  <li key={tu.id}>
                    <a
                      href={href}
                      target={esVideo ? "_blank" : undefined}
                      rel={esVideo ? "noopener noreferrer" : undefined}
                      className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-colors hover:border-cyan-300 hover:bg-cyan-50/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    >
                      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-gray-100">
                        {sinThumb ? (
                          <div className="flex h-full items-center justify-center text-gray-300">
                            {esVideo ? (
                              <PlayCircle className="h-10 w-10" aria-hidden />
                            ) : (
                              <Presentation className="h-10 w-10" aria-hidden />
                            )}
                          </div>
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            onError={() => setFallidas((s) => new Set(s).add(tu.id))}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          />
                        )}
                        <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {esVideo ? (
                            <>
                              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                              YouTube
                            </>
                          ) : (
                            <>
                              <Presentation className="h-2.5 w-2.5" aria-hidden />
                              {t("ui.tutoriales.nSlides", { n: String(tu.nSlides ?? 0) })}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
                          {tu.titulo}
                        </h3>
                        {tu.descripcion && (
                          <p className="line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-gray-500">
                            {tu.descripcion}
                          </p>
                        )}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
