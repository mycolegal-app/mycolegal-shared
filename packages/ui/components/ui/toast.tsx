"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Toast as ToastType, ToastVariant } from "../../hooks/use-toast";

const variantStyles: Record<ToastVariant, string> = {
  default: "border bg-background text-foreground",
  destructive: "border-mc-error-500 bg-mc-error-50 text-mc-error-700",
  success: "border-mc-success-500 bg-mc-success-50 text-mc-success-700",
};

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const variant = toast.variant ?? "default";

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-lg border p-4 shadow-lg transition-all",
        variantStyles[variant]
      )}
      role="alert"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm opacity-90">{toast.description}</p>
        )}
        {toast.action && (
          <a
            href={toast.action.href}
            className="mt-2 inline-flex items-center rounded-md bg-current/10 px-2.5 py-1 text-xs font-semibold underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            {toast.action.label}
          </a>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
