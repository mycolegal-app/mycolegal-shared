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
import { ArrowLeft, BookOpen, Download, Loader2, Printer } from "lucide-react";
import { NavLink as Link } from "../shared/nav-link";
import { Button } from "../ui/button";
import { useI18n } from "../i18n";
import { MANUAL_PROSE_CSS } from "./manual-prose-css";
import { buildManualPrintHtml, pdfFileName, saveBlob } from "./manual-print-pdf";

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
 *
 * #29 (TEST) — Índice con la estructura (títulos h2/h3 de cada sección) y con el
 * número de página de cada entrada; páginas numeradas al pie.
 *
 *  · Pie «n / total»: margin boxes de `@page` (`@bottom-center` con
 *    `counter(page)`/`counter(pages)`). Chrome/Edge ≥ 131 los pintan; Firefox y
 *    Safari los ignoran (el PDF sale sin numerar, el resto igual).
 *  · Números del índice: `target-counter()` no lo soporta ningún navegador, así
 *    que la paginación se HACE en cliente. La vista se maqueta en pantalla con el
 *    ancho útil de un A4 (178 mm), se mide cada bloque y se decide dónde empieza
 *    cada página; en esos bloques se fuerza el salto (`data-mp-break` →
 *    `break-before: page`). Como cada página medida cabe con holgura (96 % de la
 *    altura útil), Chrome no necesita saltos propios y su paginación coincide con
 *    la calculada. Exacto en A4 con escala 100 %; con otro papel, márgenes o
 *    escala, los números del índice pueden desviarse.
 *  · Descarga directa en PDF: no hay API del navegador que genere un PDF de texto
 *    sin pasar por el diálogo de impresión (las librerías cliente rasterizan). Si
 *    la app da `pdfEndpoint`, «Descargar PDF» manda la vista ya paginada (HTML
 *    autocontenido, `manual-print-pdf.ts`) a esa ruta, que la pinta a PDF con el
 *    servicio de platform (`POST /internal/pdf`). Sin él, el botón abre el
 *    diálogo de impresión y el usuario elige «Guardar como PDF».
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
  /**
   * #29 — Ruta de la app que convierte la vista a PDF (`POST { html, fileName }`
   * → `application/pdf`; p. ej. `/api/manual/pdf`, que delega en platform
   * `POST /internal/pdf`). Con ella aparece «Descargar PDF»; sin ella, solo
   * «Imprimir / Guardar como PDF» con el diálogo del navegador.
   */
  pdfEndpoint?: string;
  /**
   * #999 — Encabezado de página con el apartado en el que se está («Copias de
   * terceros › 2. Peticiones»): grupo y título de la sección de cada página,
   * arriba a la izquierda (margin box `@top-left` de una página con nombre por
   * sección). Como el pie numerado, lo pintan Chrome/Edge ≥ 131 (y el PDF del
   * servidor); los demás navegadores lo ignoran. Ni portada ni índice lo llevan.
   */
  runningHeader?: boolean;
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

// ── #29 — Paginación en cliente ─────────────────────────────────────────────
const MM = 96 / 25.4; // px CSS por mm
/** Ancho útil de A4 con los márgenes de `@page` (210 − 16 − 16). */
const PRINT_WIDTH_MM = 178;
/** Alto útil de A4 con los márgenes de `@page` (297 − 18 − 20). */
const PAGE_HEIGHT_PX = (297 - 18 - 20) * MM;
/** Holgura: cada página calculada ocupa como mucho esto, para que Chrome no parta por su cuenta. */
const PAGE_BUDGET_PX = PAGE_HEIGHT_PX * 0.96;

export interface ManualOutlineEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Bloques que la impresión no parte (mismo criterio que `PRINT_CSS`). */
const ATOMIC_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "FIGURE", "TABLE", "PRE",
  "BLOCKQUOTE", "DETAILS", "IMG", "DL", "HR", "SVG",
]);

function isAvoidBox(el: HTMLElement): boolean {
  const role = el.getAttribute("role");
  if (role === "note" || role === "alert") return true;
  const cls = typeof el.className === "string" ? el.className : "";
  return cls.includes("border-l-4") || (cls.includes("rounded") && /(^|\s)border(\s|$|-)/.test(cls));
}

/** Bloques «hoja» en orden de documento: los contenedores se recorren, los indivisibles no. */
function collectBlocks(root: Element, out: HTMLElement[]): HTMLElement[] {
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.tagName === "STYLE" || child.tagName === "SCRIPT") continue;
    const cs = getComputedStyle(child);
    if (cs.display === "none" || cs.position === "absolute" || cs.position === "fixed") continue;
    const layoutBox = /flex|grid|table/.test(cs.display);
    const hasBlockChildren = Array.from(child.children).some((c) => {
      const d = getComputedStyle(c).display;
      return d !== "inline" && d !== "inline-block" && d !== "none" && d !== "contents";
    });
    if (ATOMIC_TAGS.has(child.tagName) || layoutBox || isAvoidBox(child) || !hasBlockChildren) out.push(child);
    else collectBlocks(child, out);
  }
  return out;
}

/** Margen superior que conserva un salto forzado ante `el` (el suyo y el de los padres de los que es primer hijo). */
function leadingMargin(el: HTMLElement, stop: Element): number {
  let m = parseFloat(getComputedStyle(el).marginTop) || 0;
  let cur: HTMLElement = el;
  while (cur.parentElement && cur.parentElement !== stop && cur.parentElement.firstElementChild === cur) {
    cur = cur.parentElement;
    m += parseFloat(getComputedStyle(cur).marginTop) || 0;
  }
  return m;
}

/** Bloques que no deben quedarse solos al pie de una página (van con el siguiente). */
const isHeading = (el: HTMLElement) => /^H[1-6]$/.test(el.tagName) || el.tagName === "THEAD";

/**
 * Un bloque que no cabe en una página lo partiría el navegador por donde quisiera
 * y la cuenta dejaría de cuadrar. Se abre en sus partes para que los saltos los
 * decidamos nosotros: una tabla, en sus filas (el `thead` se repite en cada
 * página: `headerOf` guarda su alto); un contenedor apilado, en sus hijos. Lo que
 * no se puede abrir (una imagen, una rejilla) se devuelve tal cual.
 */
function splitTall(el: HTMLElement, headerOf: Map<HTMLElement, number>): HTMLElement[] {
  if (el.tagName === "TABLE") {
    const table = el as HTMLTableElement;
    const head = table.tHead?.getBoundingClientRect().height ?? 0;
    const rows = Array.from(table.rows).filter((tr) => tr.parentElement?.tagName !== "THEAD");
    if (rows.length < 2) return [el];
    // La primera fila sigue al `thead` en su sitio; el resto puede abrir página.
    rows.forEach((tr) => headerOf.set(tr, head));
    if (table.tHead) return [table.tHead as HTMLElement, ...rows];
    return rows;
  }
  const cs = getComputedStyle(el);
  const stacked = !/flex|grid/.test(cs.display) || (cs.display.includes("flex") && cs.flexDirection.startsWith("column"));
  if (!stacked) return [el];
  const parts: HTMLElement[] = [];
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const ccs = getComputedStyle(child);
    if (ccs.display === "none" || ccs.position === "absolute" || ccs.position === "fixed") continue;
    if (child.tagName === "STYLE" || child.tagName === "SCRIPT") continue;
    parts.push(child);
  }
  return parts.length > 0 ? parts : [el];
}

/**
 * Reparte los bloques de un contenedor (que empieza página) en páginas. Marca con
 * `data-mp-break` el bloque que abre cada página nueva y devuelve la página de
 * cada bloque y la última página usada.
 *
 * Cada página se llena como mucho hasta `PAGE_BUDGET_PX`: así el navegador nunca
 * necesita un salto propio y su paginación es exactamente la calculada.
 */
function paginateBlocks(
  container: HTMLElement,
  startTop: number,
  startPage: number,
): { pageOf: Map<HTMLElement, number>; lastPage: number } {
  const blocks = collectBlocks(container, []);
  const pageOf = new Map<HTMLElement, number>();
  const headerOf = new Map<HTMLElement, number>();
  /** Primera parte de un bloque abierto → el bloque: un salto ante ella se pone en él. */
  const openedFrom = new Map<HTMLElement, HTMLElement>();
  let page = startPage;
  let pageTop = startTop;
  /** Índice del primer bloque de la página en curso. */
  let pageStart = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const r = b.getBoundingClientRect();
    if (r.height === 0) {
      pageOf.set(b, page);
      if (i === pageStart) pageStart++;
      continue;
    }
    if (r.height > PAGE_BUDGET_PX) {
      const parts = splitTall(b, headerOf);
      if (parts.length > 1 || parts[0] !== b) {
        pageOf.set(b, page);
        openedFrom.set(parts[0], b);
        blocks.splice(i, 1, ...parts);
        i--;
        continue;
      }
    }
    if (i > pageStart && r.bottom - pageTop > PAGE_BUDGET_PX) {
      // Salto antes de `b`; los títulos que lo preceden en la misma página se van
      // con él (sin vaciar la página: el primer bloque de la página se queda).
      let first = i;
      while (first - 1 > pageStart && isHeading(blocks[first - 1])) first--;
      let opener = blocks[first];
      while (openedFrom.has(opener)) opener = openedFrom.get(opener)!;
      page++;
      const head = headerOf.get(opener);
      pageTop =
        head !== undefined
          ? opener.getBoundingClientRect().top - head
          : opener.getBoundingClientRect().top - leadingMargin(opener, container);
      opener.setAttribute("data-mp-break", "");
      pageStart = first;
      if (opener !== blocks[first]) pageOf.set(opener, page);
      for (let k = first; k < i; k++) pageOf.set(blocks[k], page);
    }
    pageOf.set(b, page);
    // Un bloque indivisible más alto que una página (raro: una imagen enorme) lo
    // corta el navegador: consume páginas enteras y lo que sigue abre página.
    if (r.bottom - pageTop > PAGE_HEIGHT_PX) {
      page += Math.ceil((r.bottom - pageTop) / PAGE_HEIGHT_PX) - 1;
      const next = blocks[i + 1];
      if (next) {
        page++;
        pageTop = next.getBoundingClientRect().top - leadingMargin(next, container);
        next.setAttribute("data-mp-break", "");
        pageStart = i + 1;
      }
    }
  }
  return { pageOf, lastPage: page };
}

/**
 * Texto de un título para el índice, sin sus acompañantes: notas y etiquetas en
 * letra menor («Disponible si tu organización lo tiene contratado»), iconos y lo
 * oculto a lectores de pantalla.
 */
function headingText(h: HTMLElement): string {
  const base = parseFloat(getComputedStyle(h).fontSize) || 0;
  const parts: string[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        parts.push(child.textContent ?? "");
      } else if (child instanceof HTMLElement) {
        if (child.getAttribute("aria-hidden") === "true") continue;
        const size = parseFloat(getComputedStyle(child).fontSize) || 0;
        if (base > 0 && size > 0 && size < base * 0.9) continue;
        walk(child);
      }
    }
  };
  walk(h);
  return parts.join("").replace(/\s+/g, " ").trim();
}

function headingPage(h: HTMLElement, pageOf: Map<HTMLElement, number>, fallback: number): number {
  let cur: HTMLElement | null = h;
  while (cur) {
    const p = pageOf.get(cur);
    if (p !== undefined) return p;
    cur = cur.parentElement;
  }
  return fallback;
}

async function waitForAssets(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((res) => {
          img.addEventListener("load", () => res(), { once: true });
          img.addEventListener("error", () => res(), { once: true });
        }),
    ),
  );
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) await fonts.ready.catch(() => undefined);
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
  @page {
    size: A4; margin: 18mm 16mm 20mm 16mm;
    @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; color: #6b7280; }
  }
  @page :first { @bottom-center { content: none; } }
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
  [data-manual-print] { width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; color: #111827; }
  [data-manual-print] [data-mp-break] { break-before: page; }
  /* El índice es un <nav>: varias apps ocultan todo nav/aside/header al imprimir
     (globals.css de Tramitación: \`nav { display: none !important }\`). */
  [data-manual-print] [data-manual-print-toc] { display: block !important; padding-top: 0 !important; }
  [data-manual-print] * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-manual-print-toolbar] { display: none !important; }
  [data-manual-print-cover] { min-height: 230mm; break-after: page; }
  [data-manual-print-section] {
    break-before: page; border-top: 0 !important; margin-top: 0 !important; padding-top: 0 !important;
  }
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
/* Sin recortes ni barras de desplazamiento, también en pantalla: lo que se mide
   para numerar el índice tiene que ser lo mismo que se imprime (un overflow
   distinto cambia el colapso de márgenes y, con él, las alturas). */
[data-manual-print] .overflow-x-auto,
[data-manual-print] .overflow-y-auto,
[data-manual-print] .overflow-auto,
[data-manual-print] .overflow-hidden { overflow: visible !important; }
[data-manual-print-toc] [data-mp-leader] { border-bottom: 1px dotted #9ca3af; transform: translateY(-0.3em); }
[data-manual-print] a[data-manual-print-unlinked] { color: inherit; text-decoration: none; cursor: text; }
`;

/** Texto del encabezado de página de una sección: «grupo › título» (sin repetir el grupo). */
export function runningHeaderText(s: { title: string; group?: string }): string {
  const g = s.group?.trim();
  return g && !s.title.includes(g) ? `${g} › ${s.title}` : s.title;
}

/** Cadena CSS entre comillas (para `content:`). */
function cssString(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
}

/**
 * #999 — CSS del encabezado de página: cada sección imprime en su propia página
 * con nombre (`page: mp-sec-<n>`; ya empieza página, así que no añade saltos), y
 * cada nombre lleva su `@top-left`.
 */
export function runningHeaderCss(sections: { key: string; title: string; group?: string }[]): string {
  const rules = sections.map((s, i) => {
    const name = `mp-sec-${i}`;
    return (
      `  [data-manual-print-section="${s.key.replace(/"/g, "")}"] { page: ${name}; }\n` +
      `  @page ${name} { @top-left { content: ${cssString(runningHeaderText(s))}; font-size: 8pt; color: #6b7280; vertical-align: bottom; padding-bottom: 3mm; } }`
    );
  });
  return `@media print {\n${rules.join("\n")}\n}`;
}

/** Línea del índice: título enlazado, puntos guía y número de página (fuera del enlace). */
function TocLine({ anchor, title, page, className }: { anchor: string; title: string; page?: number; className?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <a href={`#${anchor}`} data-manual-print-anchor={anchor} className={`hover:underline ${className ?? ""}`}>
        {title}
      </a>
      <span data-mp-leader aria-hidden="true" className="min-w-4 flex-1" />
      <span className="w-8 shrink-0 text-right tabular-nums text-gray-600">{page ?? ""}</span>
    </div>
  );
}

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
  pdfEndpoint,
  runningHeader = false,
}: ManualPrintViewProps<S>) {
  const { t, language: ctxLanguage } = useI18n();
  const lang = language ?? ctxLanguage;
  const rootRef = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState<Record<string, "ok" | "error">>({});
  // #29 — Estructura (h2/h3) de cada sección y página de cada entrada del índice.
  const [outline, setOutline] = useState<Record<string, ManualOutlineEntry[]> | null>(null);
  const [pages, setPages] = useState<Record<string, number> | null>(null);

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

  // Con todo cargado: abrir los <details>, convertir los enlaces internos y
  // sacar la estructura (títulos y subtítulos) de cada sección para el índice.
  useEffect(() => {
    if (!ready || !rootRef.current) return;
    const root = rootRef.current;
    openAllDetails(root);
    rewriteInternalLinks(root, sections);
    const next: Record<string, ManualOutlineEntry[]> = {};
    for (const s of sections) {
      const sec = root.querySelector<HTMLElement>(`#${cssEscape(sectionAnchor(s.key))}`);
      if (!sec) continue;
      next[s.key] = Array.from(sec.querySelectorAll<HTMLElement>("h2, h3"))
        .map((h, i) => {
          // Los ids de las secciones de contenido (`alta`, `enviar`…) se repiten
          // entre páginas del manual: el título lleva el suyo propio y único.
          if (!h.id) h.id = `${sectionAnchor(s.key)}-t${i}`;
          return { id: h.id, text: headingText(h), level: (h.tagName === "H2" ? 2 : 3) as 2 | 3 };
        })
        .filter((e) => e.text);
    }
    setPages(null);
    setOutline(next);
  }, [ready, sections]);

  // Con el índice ya pintado con su estructura: paginar y numerar.
  useEffect(() => {
    if (!outline || !rootRef.current) return;
    const root = rootRef.current;
    let cancelled = false;
    void (async () => {
      await waitForAssets(root);
      if (cancelled) return;
      root.querySelectorAll("[data-mp-break]").forEach((el) => el.removeAttribute("data-mp-break"));
      const result: Record<string, number> = {};
      // Página 1: portada. El índice empieza en la 2.
      let last = 1;
      const toc = root.querySelector<HTMLElement>("[data-manual-print-toc]");
      if (toc) {
        const tocTop = toc.getBoundingClientRect().top + (parseFloat(getComputedStyle(toc).paddingTop) || 0);
        last = paginateBlocks(toc, tocTop, 2).lastPage;
      }
      for (const s of sections) {
        const sec = root.querySelector<HTMLElement>(`#${cssEscape(sectionAnchor(s.key))}`);
        if (!sec) continue;
        const cs = getComputedStyle(sec);
        const top = sec.getBoundingClientRect().top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.paddingTop) || 0);
        const start = last + 1;
        const { pageOf, lastPage } = paginateBlocks(sec, top, start);
        result[sectionAnchor(s.key)] = start;
        for (const e of outline[s.key] ?? []) {
          const h = document.getElementById(e.id);
          if (h) result[e.id] = headingPage(h, pageOf, start);
        }
        last = lastPage;
      }
      if (!cancelled) setPages(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [outline, sections]);
  const paginated = ready && pages !== null;

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

  // #29 — Descarga directa: el PDF lo pinta el servidor con esta misma vista.
  const [pdfState, setPdfState] = useState<"idle" | "working" | "error">("idle");
  const handleDownload = async () => {
    const root = rootRef.current;
    if (!root || !pdfEndpoint) return;
    openAllDetails(root);
    setPdfState("working");
    try {
      const fileName = pdfFileName(appName, audience ?? title ?? t("ui.manualPrint.defaultTitle"));
      const html = await buildManualPrintHtml(root, fileName.replace(/\.pdf$/, ""));
      const res = await fetch(pdfEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ html, fileName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      saveBlob(await res.blob(), fileName);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
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
    // #29 — En pantalla, el ancho útil de un A4: lo que se mide es lo que se imprime.
    <div data-manual-print ref={rootRef} className="mx-auto pb-16 text-gray-900" style={{ width: `${PRINT_WIDTH_MM}mm` }}>
      <style>{MANUAL_PROSE_CSS}</style>
      <style>{PRINT_CSS}</style>
      {runningHeader && <style>{runningHeaderCss(sections)}</style>}

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
          {pdfState === "working"
            ? t("ui.manualPrint.downloading")
            : pdfState === "error"
            ? t("ui.manualPrint.downloadError")
            : ready && !paginated
            ? t("ui.manualPrint.paginating")
            : ready
            ? failedCount > 0
              ? t("ui.manualPrint.partial", { n: failedCount })
              : t(pdfEndpoint ? "ui.manualPrint.readyDownload" : "ui.manualPrint.ready")
            : t("ui.manualPrint.loading", { done: doneCount, total: sections.length })}
        </div>
        {pdfEndpoint ? (
          <>
            <Button type="button" variant="primary-outline" size="sm" onClick={handlePrint} disabled={!paginated} className="gap-2">
              <Printer className="h-4 w-4" />
              {t("ui.manualPrint.printOnly")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleDownload()}
              disabled={!paginated || pdfState === "working"}
              className="gap-2"
            >
              {pdfState === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("ui.manualPrint.download")}
            </Button>
          </>
        ) : (
          <Button type="button" variant="primary" size="sm" onClick={handlePrint} disabled={!paginated} className="gap-2">
            <Printer className="h-4 w-4" />
            {t("ui.manualPrint.print")}
          </Button>
        )}
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
                    <TocLine
                      anchor={sectionAnchor(s.key)}
                      title={s.title}
                      page={pages?.[sectionAnchor(s.key)]}
                      className="font-medium text-mc-action-700"
                    />
                    {(outline?.[s.key]?.length ?? 0) > 0 && (
                      <ol className="mt-1 space-y-1">
                        {outline![s.key].map((e) => (
                          <li key={e.id} className={e.level === 2 ? "pl-4 text-sm" : "pl-8 text-xs"}>
                            <TocLine anchor={e.id} title={e.text} page={pages?.[e.id]} className="text-gray-700" />
                          </li>
                        ))}
                      </ol>
                    )}
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
