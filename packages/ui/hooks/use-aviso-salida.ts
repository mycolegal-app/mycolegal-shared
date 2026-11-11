"use client";

// Aviso de «cambios sin guardar» que también vale al navegar sin recargar (12-nov-2026).
//
// `beforeunload` solo salta cuando el documento se descarga. Con la navegación sin recarga
// (NEXT_PUBLIC_NAVEGACION_SPA) hay tres salidas que no lo disparan:
//   - los enlaces del menú (NavLink): preguntan con `confirmarSalida()` antes de navegar;
//   - los avisos de la campana que llevan a otra página de la misma app (router.push): ídem;
//   - el botón «atrás»: mientras hay cambios, se añade una entrada de historial con la misma
//     URL; al volver a ella se pregunta y, si se confirma, se sale de verdad.
// Las salidas que sí recargan (otra app, otra web, cerrar la pestaña) siguen con `beforeunload`.

import { useEffect } from "react";
import { useI18n } from "../components/i18n/i18n-context";

interface Aviso {
  mensaje: string;
}

const avisos = new Set<Aviso>();

/** `true` si se puede salir: no hay cambios sin guardar, o el usuario confirma que sale igualmente. */
export function confirmarSalida(): boolean {
  const aviso = [...avisos].at(-1);
  return !aviso || window.confirm(aviso.mensaje);
}

/**
 * Mientras `activo`, avisa antes de salir de la página por cualquier camino. Sustituye al
 * `beforeunload` propio de cada pantalla. `mensaje` por defecto: `ui.common.unsavedLeave`.
 */
export function useAvisoSalida(activo: boolean, mensaje?: string): void {
  const { t } = useI18n();
  const texto = mensaje ?? t("ui.common.unsavedLeave");

  useEffect(() => {
    if (!activo) return;
    const aviso: Aviso = { mensaje: texto };
    avisos.add(aviso);

    const antesDeDescargar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", antesDeDescargar);

    // Una sola entrada de guarda por página, aunque el aviso se active varias veces. Se copia
    // el estado de Next para que, al volver a la entrada anterior (misma URL), no navegue.
    if (!window.history.state?.__avisoSalida) {
      window.history.pushState({ ...window.history.state, __avisoSalida: true }, "");
    }
    const alVolverAtras = () => {
      if (window.confirm(aviso.mensaje)) {
        quitar();
        window.history.back();
      } else {
        window.history.pushState({ ...window.history.state, __avisoSalida: true }, "");
      }
    };
    window.addEventListener("popstate", alVolverAtras);

    function quitar() {
      avisos.delete(aviso);
      window.removeEventListener("beforeunload", antesDeDescargar);
      window.removeEventListener("popstate", alVolverAtras);
    }
    return quitar;
  }, [activo, texto]);
}
