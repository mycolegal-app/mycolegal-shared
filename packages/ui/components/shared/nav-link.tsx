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
 */
export function NavLink(props: ComponentProps<typeof Link>) {
  const { onClick, href, prefetch, ...rest } = props;
  return (
    <Link
      href={href}
      // Sin precarga: la navegación es una carga de página completa (abajo), así que lo que Next
      // precargara no se usaría nunca. Con ella, cada enlace del menú visible era una petición
      // `?_rsc=` al servidor en cada página (~90 por enlace en un e2e de Redactor, 11-oct-2026).
      prefetch={prefetch ?? false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onClick?.(e);
        window.location.href = typeof href === "string" ? href : href.toString();
      }}
      {...rest}
    />
  );
}
