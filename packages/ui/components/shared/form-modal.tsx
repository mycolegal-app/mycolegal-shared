"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { cn } from "../../lib/utils";
import { LABEL_CLS } from "../../lib/action-classes";

export interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  /** Botones (Cancelar / Guardar). Se renderizan en un `DialogFooter`. */
  footer?: ReactNode;
  /** Ancho: `sm:max-w-md` (confirmaciones), `sm:max-w-lg`, `sm:max-w-2xl`, `sm:max-w-3xl` (por defecto, formularios seccionados). */
  className?: string;
}

/**
 * Modal de formulario sobre el `Dialog` compartido (focus-trap, Esc, overlay).
 * Sustituye a los `fixed inset-0 bg-black/40` artesanales. Con
 * `FormSection` + `Field` para agrupar campos en grid multicolumna sin
 * scroll vertical largo. Patrón subido desde Tramitación
 * (`components/forms/form-modal.tsx`).
 */
export function FormModal({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  className = "sm:max-w-3xl",
}: FormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(className, "max-h-[88vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="py-1">{children}</div>
        {footer ? <DialogFooter className="mt-2">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Sección de un formulario: título opcional + grid responsivo de campos. */
export function FormSection({
  title,
  description,
  cols = 2,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  cols?: 1 | 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  const colClass = cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "";
  return (
    <section className={cn("mb-5 last:mb-0", className)}>
      {title ? <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-mc-slate-400">{title}</h3> : null}
      {description ? <p className="mb-2 text-xs text-mc-slate-500">{description}</p> : null}
      <div className={cn("grid grid-cols-1 gap-x-4 gap-y-3", colClass)}>{children}</div>
    </section>
  );
}

/** Campo: label + control + hint, con span configurable dentro del grid. */
export function Field({
  label,
  required,
  hint,
  error,
  span,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  /** Mensaje de error bajo el control (en rojo). */
  error?: ReactNode;
  span?: 2 | 3 | "full";
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const spanClass =
    span === "full" ? "col-span-full" : span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <div className={cn("space-y-1", spanClass, className)}>
      <label htmlFor={htmlFor} className={LABEL_CLS}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-mc-slate-500">{hint}</p> : null}
    </div>
  );
}
