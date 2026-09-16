"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedToggleProps<V extends string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** `sm` (por defecto, text-xs — barras de bandeja) o `md` (text-sm). */
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

/**
 * Conmutador segmentado ("Mis trabajos / Toda la notaría", "Antiguos /
 * Recientes"). El segmento activo va en el color de acción de la línea.
 */
export function SegmentedToggle<V extends string>({ options, value, onChange, size = "sm", className, ariaLabel }: SegmentedToggleProps<V>) {
  const seg = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";
  return (
    <div role="group" aria-label={ariaLabel} className={cn("inline-flex rounded-md border bg-white p-0.5", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mc-action-ring",
              seg,
              active ? "bg-mc-action-600 text-white" : "text-mc-slate-600 hover:bg-mc-neutral-100",
              opt.disabled && "opacity-50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
