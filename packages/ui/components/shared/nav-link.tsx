"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * NavLink — drop-in replacement for Next.js Link that uses full-page navigation.
 *
 * Next.js App Router's client-side routing (router.push) can fail silently
 * in certain configurations (e.g. output: 'standalone'). This component
 * preserves <a> semantics (accessibility, right-click, cmd+click open in
 * new tab) while forcing window.location navigation on regular clicks.
 *
 * Use this instead of `next/link` for all internal navigation links.
 *
 * Piloto (11-nov-2026): con `NEXT_PUBLIC_NAVEGACION_SPA=1` en el `env` del
 * next.config de la app, deja navegar a Next sin recargar la página. Causa
 * probable del fallo original: Next 16.2.1 con React 18 (abril) y, en ≤16.2,
 * la navegación que se queda en nada cuando el proxy redirige a /login con el
 * token caducado (vercel/next.js#87245, corregido en 16.3.0). Red de seguridad:
 * si a los 5 s seguimos en la misma URL, se recarga como antes y queda un
 * `[navlink-respaldo]` en la consola. Los clics a la misma ruta con otra query
 * también recargan (ver `mismaRutaOtraQuery`).
 */
const NAVEGACION_SPA = process.env.NEXT_PUBLIC_NAVEGACION_SPA === "1";
const RESPALDO_MS = 5_000;

export function NavLink(props: ComponentProps<typeof Link>) {
  const { onClick, href, prefetch, ...rest } = props;
  const destino = typeof href === "string" ? href : href.toString();
  return (
    <Link
      href={href}
      // Sin precarga: la navegación es una carga de página completa (abajo), así que lo que Next
      // precargara no se usaría nunca. Con ella, cada enlace del menú visible era una petición
      // `?_rsc=` al servidor en cada página (~90 por enlace en un e2e de Redactor, 11-oct-2026).
      prefetch={prefetch ?? false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (NAVEGACION_SPA && !mismaRutaOtraQuery(destino)) {
          onClick?.(e);
          if (!e.defaultPrevented) vigilarNavegacion(destino);
          return;
        }
        e.preventDefault();
        onClick?.(e);
        window.location.href = destino;
      }}
      {...rest}
    />
  );
}

/**
 * Misma ruta, otra query (`/peticiones` → `/peticiones?tramite=x`): Next no vuelve a montar la
 * página, y muchas leen los filtros de `window.location.search` una sola vez al montarse. Esos
 * clics siguen recargando la página, como antes del piloto.
 */
function mismaRutaOtraQuery(destino: string): boolean {
  const url = new URL(destino, window.location.href);
  return (
    url.origin === window.location.origin &&
    url.pathname === window.location.pathname &&
    url.search !== window.location.search
  );
}

/** Si el clic no ha cambiado la URL al cabo de RESPALDO_MS, navega recargando la página. */
function vigilarNavegacion(destino: string): void {
  const antes = window.location.href;
  const url = new URL(destino, antes);
  // Otro origen o la misma URL: no hay navegación de Next que vigilar.
  if (url.origin !== window.location.origin || url.href === antes) return;
  setTimeout(() => {
    if (window.location.href !== antes) return; // navegó (aquí o a donde fuera)
    console.warn(`[navlink-respaldo] ${JSON.stringify({ desde: antes, a: url.href })}`);
    window.location.href = url.href;
  }, RESPALDO_MS);
}
