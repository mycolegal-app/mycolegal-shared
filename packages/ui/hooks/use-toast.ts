"use client";

import { useState, useEffect } from "react";

export type ToastVariant = "default" | "destructive" | "success";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /**
   * #720 — Acción opcional del aviso, como enlace. Nació para que un "te has
   * quedado sin créditos" no fuera un callejón sin salida también cuando se
   * reporta por toast: sin esto, el usuario lee el problema y no tiene dónde
   * resolverlo. Es un enlace y no un callback a propósito: el toast puede
   * sobrevivir a la pantalla que lo lanzó.
   */
  action?: { label: string; href: string };
}

let listeners: Array<(toasts: Toast[]) => void> = [];
let memoryToasts: Toast[] = [];
let counter = 0;

function dispatch(toasts: Toast[]) {
  memoryToasts = toasts;
  listeners.forEach((listener) => listener(toasts));
}

function addToast(toast: Omit<Toast, "id">) {
  const id = String(++counter);
  const newToast: Toast = { id, ...toast };
  dispatch([...memoryToasts, newToast]);

  setTimeout(() => {
    dispatch(memoryToasts.filter((t) => t.id !== id));
  }, 5000);

  return id;
}

function dismissToast(id: string) {
  dispatch(memoryToasts.filter((t) => t.id !== id));
}

export function toast(props: Omit<Toast, "id">) {
  return addToast(props);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(memoryToasts);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  return {
    toasts,
    toast: addToast,
    dismiss: dismissToast,
  };
}
