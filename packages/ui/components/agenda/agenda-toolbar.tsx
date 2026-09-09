"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Primitivas de la barra de la agenda.
 *
 * La cabecera tenía cuatro estéticas conviviendo en 60px de alto: nuestros
 * botones (`text-xs`, `py-1.5`), los checkboxes (`text-sm`, sin altura), el
 * `<input type="date">` nativo y la barra que pinta FullCalendar con su propio
 * CSS (~16px y padding gordo). Nada se alineaba a una rejilla porque nada
 * compartía una definición: cada control traía sus clases a mano.
 *
 * Aquí vive esa definición única. Todo lo que se monte en la barra mide 32px
 * de alto (`h-8`), usa `text-xs font-medium`, `rounded-md` y el borde del
 * sistema (`border-input`, el mismo de `<Button variant="outline">`). Si algún
 * control nuevo tiene que entrar en la barra, sale de aquí o no entra.
 */

/** Altura, radio, tipografía y foco comunes a TODO control de la barra. */
const CONTROL =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 " +
  "disabled:pointer-events-none disabled:opacity-50";

/** Piel neutra: la de los controles secundarios (la mayoría de la barra). */
const NEUTRO = "border border-input bg-background text-mc-slate-700 hover:bg-mc-neutral-100";

/** Piel primaria: reservada a la acción principal. Cyan = acento de marca. */
const PRIMARIO = "bg-cyan-600 text-white hover:bg-cyan-700";

// ---------------------------------------------------------------------------

/** Botón secundario con texto (y opcionalmente icono a la izquierda). */
export function ToolbarButton({
  icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  return (
    <button type="button" className={cn(CONTROL, NEUTRO, "px-3", className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

/** Botón cuadrado de solo icono (32×32). Exige `aria-label`. */
export function ToolbarIconButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string }) {
  return (
    <button type="button" className={cn(CONTROL, NEUTRO, "w-8 px-0", className)} {...props}>
      {children}
    </button>
  );
}

/** Separador vertical entre zonas de la barra. */
export function ToolbarSeparator() {
  return <span className="h-5 w-px shrink-0 bg-mc-neutral-200" aria-hidden="true" />;
}

/**
 * Filtro de la vista. Era un `<input type="checkbox">` con su label a `text-sm`:
 * la única tipografía distinta de la fila, sin altura propia y con etiquetas
 * largas que partían a dos líneas. Como chip pulsable mide lo mismo que el
 * resto y se lee como lo que es: un estado del calendario, encendido o apagado.
 */
export function ToolbarChip({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  /** Texto largo del filtro: vive aquí en vez de romper la línea base. */
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={cn(
        CONTROL,
        "px-2.5",
        checked
          ? "border border-cyan-600 bg-cyan-50 text-cyan-800 hover:bg-cyan-100"
          : NEUTRO,
      )}
    >
      {/* El estado no se fía solo del color: activo lleva marca. */}
      <Check className={cn("h-3.5 w-3.5", checked ? "opacity-100" : "opacity-0")} aria-hidden="true" />
      {label}
    </button>
  );
}

/** Caja que agrupa controles contiguos como una sola pieza (flechas, vistas). */
export function ToolbarGroup({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  /** Cuando el grupo es en sí un control (el selector de vista), se nombra. */
  ariaLabel?: string;
}) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 items-center overflow-hidden rounded-md border border-input bg-background",
        "[&>*+*]:border-l [&>*+*]:border-input",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Botón interior de un `ToolbarGroup` (sin borde ni radio propios). */
export function ToolbarGroupButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-xs font-medium",
        "text-mc-slate-700 transition-colors hover:bg-mc-neutral-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Selector de vista. Cuatro botones sueltos de FullCalendar —oscuros, altos y
 * con su tipografía— pasan a ser una sola pieza con el activo en sólido.
 */
export function ToolbarSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <ToolbarGroup className="shrink-0" ariaLabel={ariaLabel}>
      {options.map((o) => {
        const activo = o.value === value;
        return (
          <ToolbarGroupButton
            key={o.value}
            aria-pressed={activo}
            onClick={() => onChange(o.value)}
            className={cn(activo && "bg-mc-slate-700 text-white hover:bg-mc-slate-900")}
          >
            {o.label}
          </ToolbarGroupButton>
        );
      })}
    </ToolbarGroup>
  );
}

// ---------------------------------------------------------------------------

export type ToolbarMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Entradas que encienden/apagan algo (la leyenda) muestran su estado. */
  checked?: boolean;
};

/**
 * Menú desplegable de la barra. Mismo patrón que `<HelpMenu>` (cierre por
 * click fuera y por Escape) en vez de traerse Radix solo para esto.
 *
 * Sostiene las dos agrupaciones de la propuesta: el desbordamiento «···» —lo
 * que se usa una vez por semana y no tiene por qué ocupar sitio— y la parte
 * derecha del split button de creación.
 */
export function ToolbarMenu({
  items,
  label,
  icon,
  ariaLabel,
  align = "right",
  triggerClassName,
}: {
  items: ToolbarMenuItem[];
  label?: string;
  icon?: ReactNode;
  ariaLabel: string;
  align?: "left" | "right";
  /** Piel del disparador; por defecto la neutra de la barra. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(CONTROL, triggerClassName ?? NEUTRO, label ? "px-3" : "w-8 px-0")}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-1 min-w-[13rem] rounded-md border border-input bg-white py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-mc-slate-700 hover:bg-mc-neutral-100"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-mc-slate-700/70">
                {it.icon}
              </span>
              <span className="flex-1">{it.label}</span>
              {it.checked && <Check className="h-3.5 w-3.5 text-cyan-700" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Acción principal con menú pegado: «+ Nueva cita» y, tras el chevron, el resto
 * de cosas que se crean aquí. Antes «+ Nuevo bloqueo» era un botón outline más,
 * perdido entre Imprimir, Horario y Exportar, compitiendo con la acción que
 * de verdad se usa.
 */
export function ToolbarSplitButton({
  label,
  onClick,
  items,
  menuAriaLabel,
}: {
  label: string;
  onClick: () => void;
  items: ToolbarMenuItem[];
  menuAriaLabel: string;
}) {
  return (
    <div className="inline-flex items-stretch">
      <button
        type="button"
        onClick={onClick}
        className={cn(CONTROL, PRIMARIO, "rounded-r-none px-3")}
      >
        {label}
      </button>
      <span className="w-px bg-white/25" aria-hidden="true" />
      <ToolbarMenu
        items={items}
        ariaLabel={menuAriaLabel}
        icon={<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
        triggerClassName={cn(PRIMARIO, "rounded-l-none")}
      />
    </div>
  );
}
