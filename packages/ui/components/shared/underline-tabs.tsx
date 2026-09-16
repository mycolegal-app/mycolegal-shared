"use client";

import type { ComponentType, ReactNode } from "react";
import { NavLink } from "./nav-link";
import { cn } from "../../lib/utils";

export interface UnderlineTab {
  /** Identificador (para `value`/`onChange`) o clave de la pestaña. */
  id: string;
  label: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Contador en píldora a la derecha de la etiqueta (solo si > 0). */
  count?: number;
  /** Si se indica, la pestaña es un enlace (navegación) en vez de un botón. */
  href?: string;
  disabled?: boolean;
  /** `data-testid` opcional. */
  testId?: string;
}

export interface UnderlineTabsProps {
  tabs: UnderlineTab[];
  /** Pestaña activa (id). */
  value: string;
  /** Requerido en modo botón (sin `href`). */
  onChange?: (id: string) => void;
  /** `sm` (detalles, por defecto: text-xs) o `md` (barras de dominio: text-sm). */
  size?: "sm" | "md";
  /** Sangra la barra hasta los bordes del `<main>` (`-mx-6 px-6`). */
  bleed?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Pestañas subrayadas — las del detalle de expediente de Notaría, extraídas.
 * Activa: subrayado y texto en el color de acción de la línea. En la Línea
 * Plata el texto activo pasa a `font-semibold` (el grafito por sí solo
 * distingue menos que el cian).
 */
export function UnderlineTabs({ tabs, value, onChange, size = "sm", bleed, className, ariaLabel }: UnderlineTabsProps) {
  const txt = size === "md" ? "px-3 py-2.5 text-sm" : "px-3 py-2 text-xs";
  return (
    <div className={cn("shrink-0 border-b", bleed && "-mx-6 px-6", className)}>
      <nav className="-mb-px flex gap-0 overflow-x-auto" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const active = tab.id === value;
          const Icon = tab.icon;
          const cls = cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-action-ring",
            txt,
            active
              ? "border-mc-action-500 text-mc-action-700 [[data-brand=silver]_&]:border-mc-action-800 [[data-brand=silver]_&]:font-semibold"
              : "border-transparent text-mc-slate-500 hover:border-mc-slate-300 hover:text-mc-slate-700",
            tab.disabled && "pointer-events-none opacity-50",
          );
          const inner = (
            <>
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="ml-1 rounded-full bg-mc-action-100 px-1.5 text-[10px] font-semibold text-mc-action-700 [[data-brand=silver]_&]:bg-mc-action-800 [[data-brand=silver]_&]:text-white">
                  {tab.count}
                </span>
              )}
            </>
          );
          if (tab.href) {
            return (
              <NavLink key={tab.id} href={tab.href} className={cls} aria-current={active ? "page" : undefined} data-testid={tab.testId}>
                {inner}
              </NavLink>
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-tab-id={tab.id}
              data-testid={tab.testId}
              disabled={tab.disabled}
              onClick={() => onChange?.(tab.id)}
              className={cls}
            >
              {inner}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
