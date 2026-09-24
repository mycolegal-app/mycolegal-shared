"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * #875 — Esquina en la que el usuario quiere el botón flotante de avisos.
 *
 * POR QUÉ EXISTE
 *
 * El botón vive en `fixed bottom-6 right-6`, o sea que ocupa SIEMPRE la esquina
 * inferior derecha del viewport pase lo que pase debajo. En la cola de trámites
 * de un protocolo, la papelera del ÚLTIMO trámite cae justo ahí; y como es el
 * final de la lista, no se puede seguir bajando para sacarla de debajo. El
 * trámite quedaba imposible de borrar.
 *
 * El colchón inferior del shell evita la colisión en el caso normal, pero no
 * puede cubrir cualquier pantalla futura (una tabla ancha, un portátil pequeño,
 * un diálogo a pie de página). Esto le da al usuario la salida.
 *
 * CUATRO ESQUINAS Y NO ARRASTRE, a propósito: con posiciones discretas es
 * IMPOSIBLE dejar el botón fuera de pantalla. Un botón arrastrable a coordenadas
 * libres se queda inalcanzable en cuanto cambias de monitor o reduces la
 * ventana, y entonces sí que no hay manera de recuperarlo.
 *
 * Persistencia por usuario+dispositivo en `localStorage`, con el mismo patrón
 * (y el mismo try/catch para modo incógnito) que `app-switcher-bar` y
 * `sidebar-collapse-context`.
 */
export type FloatingCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const STORAGE_KEY = "mc.floatingReporterCorner";
const DEFAULT_CORNER: FloatingCorner = "bottom-right";

const CORNERS: FloatingCorner[] = ["bottom-right", "bottom-left", "top-right", "top-left"];

/** Clases de posición por esquina. `top-*` deja hueco para la cabecera (h-14). */
export const CORNER_CLASSES: Record<FloatingCorner, string> = {
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "top-right": "top-20 right-6",
  "top-left": "top-20 left-6",
};

function esValida(v: unknown): v is FloatingCorner {
  return typeof v === "string" && (CORNERS as string[]).includes(v);
}

export function useFloatingCorner(): {
  corner: FloatingCorner;
  setCorner: (c: FloatingCorner) => void;
  corners: FloatingCorner[];
} {
  const [corner, setCornerState] = useState<FloatingCorner>(DEFAULT_CORNER);

  // Se rehidrata tras montar: `localStorage` no existe en SSR.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (esValida(raw)) setCornerState(raw);
    } catch {
      /* localStorage bloqueado (modo privado, etc.) — nos quedamos con el default */
    }
  }, []);

  const setCorner = useCallback((c: FloatingCorner) => {
    setCornerState(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  return { corner, setCorner, corners: CORNERS };
}
