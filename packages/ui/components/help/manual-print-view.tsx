"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { ArrowLeft, BookOpen, Printer } from "lucide-react";
import { NavLink as Link } from "../shared/nav-link";
import { Button } from "../ui/button";
import { useI18n } from "../i18n";
import { MANUAL_PROSE_CSS } from "./manual-prose-css";

/**
 * #905 — Vista de impresión de un manual: portada, índice con anclas y TODAS las
 * secciones seguidas (una por página), con un botón «Descargar en PDF /
 * Imprimir» que abre el diálogo del navegador (Guardar como PDF). No se lanza
 * sola: el botón se habilita cuando han cargado todas las secciones.
 *
 * Cada sección se pinta con el mismo resolver del manual en pantalla
 * (`createManualResolver`). Los `next/dynamic` del App Router suspenden hasta
 * cargar su trozo; cada sección va en su propio `<Suspense>` y un marcador
 * hermano avisa al montarse, que es cuando el contenido ya está pintado.
 *
 * El CSS de impresión va dentro del componente y está acotado con
 * `body:has([data-manual-print])`: no toca la impresión del resto de la app.
 */

export interface ManualPrintSection<S extends string = string> {
  /** Clave de la sección en el resolver (`home`, `copias`…). */
  key: S;
  /** Título para el índice (y para el cuerpo si `showSectionTitles`). */
  title: string;
  /** Grupo opcional: las secciones seguidas con el mismo grupo se agrupan en el índice. */
  group?: string;
  /**
   * Ruta de la sección en el manual en pantalla (p. ej. `/manual/copias`). Si se
   * da, los enlaces del contenido que apuntan a ella (`/manual/copias#proforma`)
   * se convierten en anclas internas de esta vista.
   */
  href?: string;
}

export interface ManualPrintViewProps<S extends string = string> {
  /** Secciones en el orden en que se imprimen. */
  sections: ManualPrintSection<S>[];
  /** El resolver del manual de la app (`getManualComponent`). */
  resolve: (language: string, section: S) => ComponentType;
  /** Nombre de la app en la portada (p. ej. «MycoLegal Tramitación»). */
  appName: string;
  /** Título del documento. Por defecto «Manual de usuario» en el idioma activo. */
  title?: string;
  /** Etiqueta de audiencia bajo el título (p. ej. «Manual de gestoría»). */
  audience?: string;
  /** Idioma del contenido. Por defecto, el del `I18nProvider`. */
  language?: string;
  /** Enlace «Volver al manual» de la barra (no se imprime). */
  backHref?: string;
  /** Pinta el título de cada sección encima de su contenido (si el contenido no trae su `h1`). */
  showSectionTitles?: boolean;
  /** Fecha de la portada. Por defecto, hoy. */
  date?: Date;
}

const LOCALE: Record<string, string> = {
  CAST: "es-ES",
  CAT: "ca-ES",
  VAL: "ca-ES",
  GAL: "gl-ES",
  EUS: "eu-ES",
};

export const MANUAL_PRINT_ANCHOR_PREFIX = "mp-";

function sectionAnchor(key: string) {
  return `${MANUAL_PRINT_ANCHOR_PREFIX}${key}`;
}

function cssEscape(v: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(v)
    : v.replace(/["\\#.:\[\]()]/g, "\\$&");
}

function normalizePath(p: string) {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/** Marca la sección como lista cuando su contenido (ya sin suspender) se monta. */
function LoadedMarker({ onLoaded }: { onLoaded: () => void }) {
  useEffect(() => {
    onLoaded();
  }, [onLoaded]);
  return null;
}

/** Si el trozo de una sección falla al cargar, se avisa en su sitio y no se bloquea el resto. */
class SectionErrorBoundary extends Component<
  { onError: () => void; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function openAllDetails(root: HTMLElement | null) {
  root?.querySelectorAll("details").forEach((d) => {
    d.open = true;
  });
}

/**
 * Reescribe los enlaces internos del manual (`/manual/x#y`) a anclas de esta
 * vista. Los que apuntan a otra página de manual (ruta con un segmento
 * `manual`) que no está en la vista pierden el enlace y quedan como texto. El
 * resto (externos, otras rutas) no se tocan. Sin `href` en las secciones, nada.
 */
function rewriteInternalLinks(
  root: HTMLElement,
  sections: ManualPrintSection[],
): void {
  const byPath = new Map<string, string>();
  for (const s of sections) if (s.href) byPath.set(normalizePath(s.href), s.key);
  if (byPath.size === 0) return;
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    if (a.closest("[data-manual-print-toc]")) return;
    const raw = a.getAttribute("href") ?? "";
    if (!raw.startsWith("/")) return;
    const [pathPart, hash] = raw.split("#");
    const path = normalizePath(pathPart.split("?")[0]);
    const key = byPath.get(path);
    if (key !== undefined) {
      let target = sectionAnchor(key);
      if (hash) {
        const sectionEl = root.querySelector(`#${cssEscape(sectionAnchor(key))}`);
        const matches = root.querySelectorAll(`[id="${cssEscape(hash)}"]`);
        if (matches.length === 1 && sectionEl?.contains(matches[0])) target = hash;
      }
      a.setAttribute("href", `#${target}`);
      a.setAttribute("data-manual-print-anchor", target);
      return;
    }
    // Otra página de manual (`/manual/...`, `/actas/manual`) que no está en la vista.
    if (/(^|\/)manual(\/|$)/.test(path)) {
      a.removeAttribute("href");
      a.setAttribute("data-manual-print-unlinked", "");
    }
  });
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  html:has([data-manual-print]),
  body:has([data-manual-print]) {
    height: auto !important; min-height: 0 !important;
    overflow: visible !important; background: #fff !important;
  }
  /* Todo lo que no sea la vista, ni la contenga, ni esté dentro: fuera
     (navegación, barras laterales, cabeceras, botones flotantes, avisos…). */
  body:has([data-manual-print]) *:not(:has([data-manual-print])):not([data-manual-print]):not([data-manual-print] *) {
    display: none !important;
  }
  /* Los contenedores de la vista: sin alturas fijas, recortes ni márgenes del
     armazón (h-screen, overflow-hidden, ml-[220px], h-[calc(...)]…). */
  body:has([data-manual-print]) *:has([data-manual-print]) {
    display: block !important; position: static !important;
    height: auto !important; min-height: 0 !important; max-height: none !important;
    width: auto !important; max-width: none !important;
    overflow: visible !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; box-shadow: none !important; transform: none !important;
    background: transparent !important;
  }
  [data-manual-print] { max-width: none !important; margin: 0 !important; padding: 0 !important; color: #111827; }
  [data-manual-print] * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-manual-print-toolbar] { display: none !important; }
  [data-manual-print-cover] { min-height: 230mm; break-after: page; }
  [data-manual-print-section] {
    break-before: page; border-top: 0 !important; margin-top: 0 !important; padding-top: 0 !important;
  }
  [data-manual-print] .overflow-x-auto,
  [data-manual-print] .overflow-y-auto,
  [data-manual-print] .overflow-auto,
  [data-manual-print] .overflow-hidden { overflow: visible !important; }
  [data-manual-print] h1, [data-manual-print] h2,
  [data-manual-print] h3, [data-manual-print] h4 { break-after: avoid; }
  [data-manual-print] table, [data-manual-print] pre, [data-manual-print] blockquote,
  [data-manual-print] figure, [data-manual-print] details, [data-manual-print] [role="note"],
  [data-manual-print] [role="alert"], [data-manual-print] [class*="border-l-4"],
  [data-manual-print] [class*="rounded"][class*="border"], [data-manual-print] li {
    break-inside: avoid;
  }
  [data-manual-print] thead { display: table-header-group; }
  [data-manual-print] tr { break-inside: avoid; }
  [data-manual-print] details > summary { list-style: none; }
  [data-manual-print] details > summary::-webkit-details-marker { display: none; }
  [data-manual-print] a { color: inherit !important; text-decoration: none !important; }
}
[data-manual-print] a[data-manual-print-unlinked] { color: inherit; text-decoration: none; cursor: text; }
`;

export function ManualPrintView<S extends string>({
  sections,
  resolve,
  appName,
  title,
  audience,
  language,
  backHref,
  showSectionTitles = false,
  date,
}: ManualPrintViewProps<S>) {
  const { t, language: ctxLanguage } = useI18n();
  const lang = language ?? ctxLanguage;
  const rootRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState<Record<string, "ok" | "error">>({});

  const markLoaded = useCallback((key: string, status: "ok" | "error") => {
    setSettled((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
  }, []);
  // Callbacks estables por sección (el marcador los usa en su efecto).
  const callbacks = useMemo(() => {
    const m = new Map<string, { ok: () => void; error: () => void }>();
    for (const s of sections) {
      m.set(s.key, { ok: () => markLoaded(s.key, "ok"), error: () => markLoaded(s.key, "error") });
    }
    return m;
  }, [sections, markLoaded]);

  const doneCount = sections.filter((s) => settled[s.key]).length;
  const ready = doneCount === sections.length;
  const failedCount = sections.filter((s) => settled[s.key] === "error").length;

  // Con todo cargado: abrir los <details> y convertir los enlaces internos.
  useEffect(() => {
    if (!ready || !rootRef.current) return;
    openAllDetails(rootRef.current);
    rewriteInternalLinks(rootRef.current, sections);
  }, [ready, sections]);

  // También justo antes de imprimir (Ctrl+P sin pasar por el botón).
  useEffect(() => {
    const onBeforePrint = () => openAllDetails(rootRef.current);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, []);

  // Los enlaces reescritos: desplazarse en la vista en vez de navegar (el
  // NavLink de Next haría router.push con su href original). Captura en el
  // contenedor para adelantarse al onClick de React.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !root.contains(a)) return;
      if (a.hasAttribute("data-manual-print-unlinked")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const target = a.getAttribute("data-manual-print-anchor");
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    root.addEventListener("click", onClick, true);
    return () => root.removeEventListener("click", onClick, true);
  }, []);

  const handlePrint = () => {
    openAllDetails(rootRef.current);
    window.print();
  };

  const dateLabel = useMemo(() => {
    const d = date ?? new Date();
    try {
      return new Intl.DateTimeFormat(LOCALE[lang] ?? "es-ES", { dateStyle: "long" }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }, [date, lang]);

  const docTitle = title ?? t("ui.manualPrint.defaultTitle");
  const langKey = lang === "VAL" ? "CAT" : lang;

  // Índice agrupado: tramos consecutivos con el mismo grupo.
  const tocGroups: { group?: string; items: ManualPrintSection<S>[] }[] = [];
  for (const s of sections) {
    const last = tocGroups[tocGroups.length - 1];
    if (last && last.group === s.group) last.items.push(s);
    else tocGroups.push({ group: s.group, items: [s] });
  }

  return (
    <div data-manual-print ref={rootRef} className="mx-auto max-w-3xl px-6 pb-16 text-gray-900">
      <style>{MANUAL_PROSE_CSS}</style>
      <style>{PRINT_CSS}</style>

      {/* Barra (no se imprime) */}
      <div
        data-manual-print-toolbar
        className="sticky top-0 z-10 -mx-6 mb-8 flex flex-wrap items-center gap-3 border-b bg-white/95 px-6 py-3 backdrop-blur"
      >
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("ui.manualPrint.back")}
          </Link>
        )}
        <div className="flex-1 text-sm text-gray-500" aria-live="polite">
          {ready
            ? failedCount > 0
              ? t("ui.manualPrint.partial", { n: failedCount })
              : t("ui.manualPrint.ready")
            : t("ui.manualPrint.loading", { done: doneCount, total: sections.length })}
        </div>
        <Button type="button" variant="primary" size="sm" onClick={handlePrint} disabled={!ready} className="gap-2">
          <Printer className="h-4 w-4" />
          {t("ui.manualPrint.print")}
        </Button>
      </div>

      {/* Portada */}
      <section data-manual-print-cover className="flex flex-col justify-center py-24">
        <div className="mb-6 flex items-center gap-2 text-mc-action-700">
          <BookOpen className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-wider">{appName}</span>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-gray-900">{docTitle}</h1>
        {audience && <p className="mt-3 text-xl text-gray-600">{audience}</p>}
        <dl className="mt-12 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm text-gray-600">
          <dt className="font-medium text-gray-500">{t("ui.manualPrint.languageLabel")}</dt>
          <dd>{t(`ui.manualPrint.languages.${langKey}`)}</dd>
          <dt className="font-medium text-gray-500">{t("ui.manualPrint.dateLabel")}</dt>
          <dd>{dateLabel}</dd>
        </dl>
      </section>

      {/* Índice */}
      <nav data-manual-print-toc aria-label={t("ui.manualPrint.toc")} className="py-8">
        <h2 className="mb-6 text-2xl font-semibold text-gray-900">{t("ui.manualPrint.toc")}</h2>
        <div className="space-y-5">
          {tocGroups.map((g, gi) => (
            <div key={`${g.group ?? ""}-${gi}`}>
              {g.group && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g.group}</p>
              )}
              <ol className="space-y-1.5">
                {g.items.map((s) => (
                  <li key={s.key}>
                    <a
                      href={`#${sectionAnchor(s.key)}`}
                      data-manual-print-anchor={sectionAnchor(s.key)}
                      className="text-mc-action-700 hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </nav>

      {/* Secciones, cada una en su página */}
      {sections.map((s) => {
        const Content = resolve(lang, s.key);
        const cb = callbacks.get(s.key)!;
        return (
          <section
            key={s.key}
            id={sectionAnchor(s.key)}
            data-manual-print-section={s.key}
            className="manual-prose scroll-mt-20 border-t pt-10 mt-10 [&_section]:scroll-mt-20"
          >
            {s.group && (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{s.group}</p>
            )}
            {showSectionTitles && <h1 className="mb-4 text-2xl font-bold text-gray-900">{s.title}</h1>}
            <SectionErrorBoundary
              onError={cb.error}
              fallback={
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  {t("ui.manualPrint.sectionError", { section: s.title })}
                </p>
              }
            >
              <Suspense
                fallback={<p className="text-sm text-gray-400">{t("ui.manualPrint.sectionLoading")}</p>}
              >
                <Content />
                <LoadedMarker onLoaded={cb.ok} />
              </Suspense>
            </SectionErrorBoundary>
          </section>
        );
      })}
    </div>
  );
}
