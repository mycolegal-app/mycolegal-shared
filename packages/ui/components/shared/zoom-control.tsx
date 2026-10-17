"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ZoomIn } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

// #973 — Tamaño de pantalla. Muchos usuarios ven la aplicación demasiado grande
// y no se les ocurre el zoom del navegador (Ctrl -). Este control lo pone a la
// vista en la barra superior. Se guarda en el navegador: es una preferencia del
// puesto (pantalla de ese ordenador), no de la cuenta.
//
// Se aplica con `zoom` en <html>. Con zoom, `100vh` dentro del documento también
// se escala, y el shell (`h-screen`) quedaría más corto que la ventana: por eso
// la regla de abajo divide su altura por el mismo factor.

const NIVELES = [75, 90, 100, 110] as const;
const CLAVE = "mycolegal:zoom";
const STYLE_ID = "mycolegal-zoom-style";

function leer(): number {
  try {
    const v = Number(window.localStorage.getItem(CLAVE));
    return (NIVELES as readonly number[]).includes(v) ? v : 100;
  } catch {
    return 100;
  }
}

function aplicar(pct: number) {
  const html = document.documentElement;
  if (pct === 100) {
    html.style.removeProperty("zoom");
    html.style.removeProperty("--ui-zoom");
    return;
  }
  html.style.setProperty("zoom", String(pct / 100));
  html.style.setProperty("--ui-zoom", String(pct / 100));
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = "html[style*='--ui-zoom'] .h-screen{height:calc(100vh / var(--ui-zoom))}";
    document.head.appendChild(s);
  }
}

export function ZoomControl() {
  const { t } = useI18n();
  const [pct, setPct] = useState(100);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = leer();
    setPct(v);
    aplicar(v);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function elegir(v: number) {
    setPct(v);
    aplicar(v);
    try {
      window.localStorage.setItem(CLAVE, String(v));
    } catch {
      /* sin almacenamiento: vale para esta visita */
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative print:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("ui.header.zoomAria")}
        title={t("ui.header.zoomAria")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1 rounded px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
      >
        <ZoomIn className="h-4 w-4" />
        <span className="tabular-nums">{pct}%</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          <p className="px-3 pb-1 pt-2 text-[13px] font-medium text-gray-800">{t("ui.header.zoomAria")}</p>
          <p className="px-3 pb-2 text-xs text-gray-500">{t("ui.header.zoomHint")}</p>
          {NIVELES.map((v) => (
            <button
              key={v}
              type="button"
              role="menuitemradio"
              aria-checked={v === pct}
              onClick={() => elegir(v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
            >
              <span>
                {v}%{v === 100 ? ` (${t("ui.header.zoomNormal")})` : ""}
              </span>
              {v === pct && <Check className="h-4 w-4 text-cyan-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
