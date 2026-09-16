"use client";

import type { ComponentType, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface FilterChipProps {
  label: ReactNode;
  active?: boolean;
  /** Contador a la derecha (se atenúa con `opacity-60`). */
  count?: number;
  icon?: ComponentType<{ className?: string }>;
  /**
   * `action` (por defecto): el color de acción de la línea.
   * `warning`: ámbar — para atributos derivados que señalan urgencia
   * ("Agendados", "Vencidos") y se leen igual en las dos líneas.
   */
  tone?: "action" | "warning";
  /** Atenúa el chip inactivo (p.ej. estados terminados en la fila de activos). */
  dim?: boolean;
  onClick?: () => void;
  /** Si se indica, muestra una × para quitar el filtro (chip "aplicado"). */
  onRemove?: () => void;
  title?: string;
  className?: string;
}

/**
 * Chip de filtro de bandeja (fila de estados sobre la DataTable). Activo:
 * fondo suave + borde en el color de acción (oro) o relleno sólido (plata).
 */
export function FilterChip({ label, active, count, icon: Icon, tone = "action", dim, onClick, onRemove, title, className }: FilterChipProps) {
  const activeCls =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-mc-action-300 bg-mc-action-50 text-mc-action-700 " +
        "[[data-brand=silver]_&]:border-mc-action-700 [[data-brand=silver]_&]:bg-mc-action-700 [[data-brand=silver]_&]:text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-action-ring",
        active ? activeCls : "border-mc-slate-200 bg-white text-mc-slate-600 hover:bg-mc-neutral-50",
        !active && dim && "opacity-70",
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
      {count != null && <span className="opacity-60">{count}</span>}
      {onRemove && (
        <span
          role="button"
          aria-label="×"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-1 rounded-full p-0.5 hover:bg-black/10"
        >
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/** Separador vertical entre grupos de chips. */
export function FilterChipDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-mc-slate-200" />;
}
