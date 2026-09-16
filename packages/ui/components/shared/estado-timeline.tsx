"use client";

import { Check, X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface EstadoTimelineStep {
  /** Código del estado (se compara con `current`). */
  codigo: string;
  /** Etiqueta corta (ya traducida). */
  label: string;
}

export interface EstadoTimelineProps {
  /** Pasos lineales en orden. */
  steps: EstadoTimelineStep[];
  /** Código del estado actual. Si no está en `steps`, todos se pintan futuros. */
  current: string;
  /** Estado terminal fuera del flujo (anulado/cancelado): sustituye al stepper. */
  cancelled?: boolean;
  /** Etiqueta del estado terminal (ya traducida). */
  cancelledLabel?: string;
  /** Tamaño: `sm` (detalle, por defecto) o `md` (cabeceras amplias). */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Stepper horizontal de estado — el de los detalles de expediente/protocolo
 * de Notaría, generalizado. Hecho = verde, actual = color de acción de la
 * línea (cian en oro, grafito en plata), futuro = gris. Va dentro de una
 * caja `rounded-md border bg-white px-3 py-1.5` en la cabecera del detalle.
 */
export function EstadoTimeline({
  steps,
  current,
  cancelled,
  cancelledLabel = "ANULADO",
  size = "sm",
  className,
}: EstadoTimelineProps) {
  if (cancelled) {
    return (
      <div className={cn("flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5", className)}>
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
          <X className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold text-red-700">{cancelledLabel}</span>
      </div>
    );
  }

  const currentIndex = steps.findIndex((s) => s.codigo === current);
  const node = size === "md" ? "h-7 w-7 text-[11px]" : "h-6 w-6 text-[10px]";
  const label = size === "md" ? "text-[11px]" : "text-[10px]";
  const lineTop = size === "md" ? "mt-[14px]" : "mt-[12px]";

  return (
    <div className={cn("flex w-full items-center py-0.5", className)} role="list" aria-label="Estado">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === steps.length - 1;
        return (
          <div key={step.codigo} className={cn("flex items-center", !isLast && "flex-1")} role="listitem" aria-current={isCurrent ? "step" : undefined}>
            <div className="flex shrink-0 flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center rounded-full border-2 font-bold transition-all",
                  node,
                  isCompleted && "border-green-500 bg-green-500 text-white",
                  isCurrent && "border-mc-action-600 bg-mc-action-600 text-white shadow-sm",
                  !isCompleted && !isCurrent && "border-mc-slate-300 bg-white text-mc-slate-400",
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
              </div>
              <span
                className={cn(
                  "mt-0.5 whitespace-nowrap font-medium leading-tight",
                  label,
                  isCompleted && "text-green-600",
                  isCurrent && "font-semibold text-mc-action-700",
                  !isCompleted && !isCurrent && "text-mc-slate-400",
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className={cn("mx-0.5 h-0.5 flex-1 self-start", lineTop, index < currentIndex ? "bg-green-500" : "bg-mc-slate-300")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
