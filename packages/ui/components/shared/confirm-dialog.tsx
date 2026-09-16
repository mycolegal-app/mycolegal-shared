"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useI18n } from "../i18n/i18n-context";
import { INPUT_CLS } from "../../lib/action-classes";
import { cn } from "../../lib/utils";

// ---------------------------------------------------------------------------
// <ConfirmDialog> — declarativo
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Texto del botón de confirmar (por defecto "Aceptar" traducido). */
  confirmLabel?: ReactNode;
  /** Texto del botón de cancelar (por defecto "Cancelar" traducido). */
  cancelLabel?: ReactNode;
  /**
   * `default`: acción normal (botón primario de la línea).
   * `destructive`: acción irreversible (botón rojo, foco inicial en Cancelar).
   */
  tone?: "default" | "destructive";
  /**
   * Texto que el usuario debe teclear para habilitar Confirmar (p.ej. "ANULAR").
   * Para acciones irreversibles de verdad.
   */
  requireText?: string;
  /** Contenido extra bajo la descripción (un campo de motivo, un aviso). */
  children?: ReactNode;
  /**
   * Acción al confirmar. Si devuelve una promesa, el diálogo bloquea los botones
   * y muestra el spinner hasta que resuelve; si rechaza, se queda abierto y
   * muestra el error.
   */
  onConfirm: () => void | Promise<void>;
  /** Modo aviso (`alert`): un solo botón, sin Cancelar. */
  alertOnly?: boolean;
  /** Fuerza el estado de carga desde fuera. */
  loading?: boolean;
  /** Deshabilita Confirmar desde fuera (p.ej. campo obligatorio vacío). */
  confirmDisabled?: boolean;
  className?: string;
}

/**
 * Diálogo de confirmación sobre el `Dialog` compartido (focus-trap, Esc y
 * click fuera CANCELAN, nunca confirman). Sustituye a `confirm()` /
 * `alert()` nativos. Para uso imperativo ver `useConfirm()` / `useAlert()`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  requireText,
  children,
  onConfirm,
  alertOnly,
  loading: loadingProp,
  confirmDisabled,
  className,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const loading = busy || !!loadingProp;

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
      setTyped("");
    }
  }, [open]);

  const textOk = (!requireText || typed.trim() === requireText) && !confirmDisabled;

  async function handleConfirm() {
    if (loading || !textOk) return;
    setError(null);
    try {
      const r = onConfirm();
      if (r && typeof (r as Promise<void>).then === "function") {
        setBusy(true);
        await r;
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const Icon = tone === "destructive" ? AlertTriangle : Info;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent
        className={cn("sm:max-w-md", className)}
        // Foco inicial en Cancelar cuando la acción es destructiva: Enter no
        // confirma por accidente.
        onOpenAutoFocus={(e) => {
          if (tone === "destructive" && cancelRef.current) {
            e.preventDefault();
            cancelRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5 shrink-0", tone === "destructive" ? "text-red-600" : "text-mc-action-600")} />
            {title}
          </DialogTitle>
          {description ? <DialogDescription className="whitespace-pre-line">{description}</DialogDescription> : null}
        </DialogHeader>
        {(children || requireText) && (
          <div className="space-y-3 py-1 text-sm">
            {children}
            {requireText && (
              <div>
                <label className="mb-1 block text-xs font-medium text-mc-slate-700">
                  {t("ui.confirm.typeToConfirm", { text: requireText })}
                </label>
                <input
                  autoFocus={tone !== "destructive"}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className={cn(INPUT_CLS, "font-mono uppercase")}
                  placeholder={requireText}
                  disabled={loading}
                />
              </div>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          {!alertOnly && (
            <Button ref={cancelRef} type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
              {cancelLabel ?? t("ui.confirm.cancel")}
            </Button>
          )}
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "primary"}
            size="sm"
            onClick={handleConfirm}
            disabled={loading || !textOk}
            autoFocus={alertOnly}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel ?? t(alertOnly ? "ui.confirm.ok" : "ui.confirm.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// useConfirm() / useAlert() — imperativo, como confirm()/alert() nativos
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "default" | "destructive";
  requireText?: string;
  children?: ReactNode;
  /**
   * Acción a ejecutar dentro del diálogo (con spinner y error inline). Si se
   * omite, `confirm()` resuelve `true` y la acción la hace el llamante.
   */
  action?: () => Promise<void> | void;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
type AlertFn = (opts: Omit<ConfirmOptions, "cancelLabel" | "tone" | "requireText" | "action"> & { tone?: "default" | "destructive" }) => Promise<void>;

export interface PromptOptions {
  title: ReactNode;
  description?: ReactNode;
  /** Etiqueta del campo (por defecto ninguna). */
  label?: ReactNode;
  placeholder?: string;
  /** Valor inicial. */
  defaultValue?: string;
  /** Si es true, Confirmar queda deshabilitado con el campo vacío. */
  required?: boolean;
  /** `textarea` (por defecto) o `input` de una línea. */
  multiline?: boolean;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "default" | "destructive";
}
/** Resuelve el texto tecleado, o `null` si se cancela (como `prompt()` nativo). */
type PromptFn = (opts: PromptOptions) => Promise<string | null>;

interface ConfirmContextValue {
  confirm: ConfirmFn;
  alert: AlertFn;
  prompt: PromptFn;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface PendingState {
  opts: ConfirmOptions;
  alertOnly: boolean;
  prompt?: PromptOptions;
  resolve: (ok: boolean) => void;
}

/**
 * Monta UN diálogo global y expone `useConfirm()` / `useAlert()`. Lo incluye
 * el `AppShell` compartido, así que las apps no necesitan montarlo.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const [open, setOpen] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const promptResolveRef = useRef<((v: string | null) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, alertOnly: false, resolve });
      setOpen(true);
    });
  }, []);

  const alert = useCallback<AlertFn>((opts) => {
    return new Promise<void>((resolve) => {
      setPending({ opts, alertOnly: true, resolve: () => resolve() });
      setOpen(true);
    });
  }, []);

  const prompt = useCallback<PromptFn>((opts) => {
    return new Promise<string | null>((resolve) => {
      promptResolveRef.current = resolve;
      setPromptValue(opts.defaultValue ?? "");
      setPending({
        opts: { title: opts.title, description: opts.description, confirmLabel: opts.confirmLabel, cancelLabel: opts.cancelLabel, tone: opts.tone },
        alertOnly: false,
        prompt: opts,
        // Cancelar → null (como el prompt nativo).
        resolve: (ok) => { if (!ok) resolve(null); },
      });
      setOpen(true);
    });
  }, []);

  const value = useMemo(() => ({ confirm, alert, prompt }), [confirm, alert, prompt]);

  function close(ok: boolean) {
    setOpen(false);
    pending?.resolve(ok);
    // El estado se limpia tras la animación de cierre.
    setTimeout(() => setPending(null), 200);
  }

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          open={open}
          onOpenChange={(o) => { if (!o) close(false); }}
          title={pending.opts.title}
          description={pending.opts.description}
          confirmLabel={pending.opts.confirmLabel}
          cancelLabel={pending.opts.cancelLabel}
          tone={pending.opts.tone}
          requireText={pending.opts.requireText}
          alertOnly={pending.alertOnly}
          onConfirm={async () => {
            if (pending.opts.action) await pending.opts.action();
            if (pending.prompt) {
              promptResolveRef.current?.(promptValue);
              promptResolveRef.current = null;
            }
            // El diálogo cierra después vía onOpenChange(false) → close(false):
            // como una promesa solo se resuelve una vez, ese `false` posterior
            // no pisa este `true`.
            pending.resolve(true);
          }}
          loading={undefined}
          confirmDisabled={!!pending.prompt?.required && promptValue.trim() === ""}
        >
          {pending.opts.children}
          {pending.prompt && (
            <div>
              {pending.prompt.label && (
                <label className="mb-1 block text-xs font-medium text-mc-slate-700">{pending.prompt.label}</label>
              )}
              {pending.prompt.multiline === false ? (
                <input
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={pending.prompt.placeholder}
                  className={INPUT_CLS}
                />
              ) : (
                <textarea
                  autoFocus
                  rows={3}
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={pending.prompt.placeholder}
                  className={INPUT_CLS}
                />
              )}
            </div>
          )}
        </ConfirmDialog>
      )}
    </ConfirmContext.Provider>
  );
}

function useConfirmContext(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm/useAlert requieren <ConfirmProvider> (lo monta el AppShell compartido).");
  }
  return ctx;
}

/**
 * `const confirm = useConfirm(); if (!(await confirm({ title, description, tone: "destructive" }))) return;`
 * Sustituto 1:1 del `confirm()` nativo. Resuelve `false` con Esc, click fuera o Cancelar.
 */
export function useConfirm(): ConfirmFn {
  return useConfirmContext().confirm;
}

/** Sustituto del `alert()` nativo: un solo botón, resuelve al cerrar. */
export function useAlert(): AlertFn {
  return useConfirmContext().alert;
}

/** Sustituto del `prompt()` nativo: resuelve el texto, o `null` si se cancela. */
export function usePrompt(): PromptFn {
  return useConfirmContext().prompt;
}
