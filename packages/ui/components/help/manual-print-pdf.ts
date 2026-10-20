/**
 * #29 (TEST) — «Descargar en PDF directamente» desde la vista de impresión.
 *
 * El navegador no deja generar un PDF de texto sin pasar por su diálogo de
 * impresión, así que el PDF lo pinta el Chromium del servicio de platform
 * (`POST /internal/pdf`, vía una ruta de la app). Aquí se construye el HTML que
 * se le manda: una foto AUTOCONTENIDA de la vista ya paginada —con los números
 * del índice y los saltos `data-mp-break` calculados en el navegador del
 * usuario—, con el CSS de la página, las fuentes y las imágenes incrustadas
 * (data URI). Así el servidor no tiene que pedir nada a la red y maqueta con la
 * misma tipografía, que es lo que hace que los números del índice cuadren.
 */

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

async function toDataUrl(url: string, cache: Map<string, Promise<string | null>>): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
    cache.set(url, p);
  }
  return p;
}

/** Reescribe los `url()` de una regla: absolutos y, si es una fuente, incrustados. */
async function resolveUrls(
  cssText: string,
  base: string,
  inline: boolean,
  cache: Map<string, Promise<string | null>>,
): Promise<string> {
  const matches = Array.from(cssText.matchAll(URL_RE));
  if (matches.length === 0) return cssText;
  const repl = await Promise.all(
    matches.map(async (m) => {
      const raw = m[2].trim();
      if (raw.startsWith("data:") || raw.startsWith("#")) return m[0];
      let abs: string;
      try {
        abs = new URL(raw, base).href;
      } catch {
        return m[0];
      }
      const data = inline ? await toDataUrl(abs, cache) : null;
      return `url("${data ?? abs}")`;
    }),
  );
  let i = 0;
  return cssText.replace(URL_RE, () => repl[i++]);
}

/** Todo el CSS de la página (salvo el que ya va dentro de la vista), con las fuentes incrustadas. */
async function collectCss(root: HTMLElement, cache: Map<string, Promise<string | null>>): Promise<string> {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode;
    if (owner && root.contains(owner)) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // hoja de otro origen: no se puede leer
    }
    const base = sheet.href ?? document.baseURI;
    for (const rule of Array.from(rules)) {
      const isFont = typeof CSSFontFaceRule !== "undefined" && rule instanceof CSSFontFaceRule;
      out.push(await resolveUrls(rule.cssText, base, isFont, cache));
    }
  }
  return out.join("\n");
}

function attrs(el: Element): string {
  return Array.from(el.attributes)
    .map((a) => ` ${a.name}="${a.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
    .join("");
}

/**
 * HTML completo y autocontenido de la vista de impresión, listo para pintarlo a
 * PDF en el servidor. `root` es el contenedor `[data-manual-print]` ya paginado.
 */
export async function buildManualPrintHtml(root: HTMLElement, title: string): Promise<string> {
  const cache = new Map<string, Promise<string | null>>();
  const css = await collectCss(root, cache);

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-manual-print-toolbar], script, noscript").forEach((el) => el.remove());
  clone.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
  const origImgs = Array.from(root.querySelectorAll("img"));
  const cloneImgs = Array.from(clone.querySelectorAll("img"));
  await Promise.all(
    cloneImgs.map(async (img, i) => {
      const src = origImgs[i]?.currentSrc || origImgs[i]?.src || img.getAttribute("src") || "";
      img.removeAttribute("srcset");
      img.removeAttribute("loading");
      if (!src) return;
      const data = await toDataUrl(new URL(src, document.baseURI).href, cache);
      if (data) img.setAttribute("src", data);
      else img.remove();
    }),
  );
  // Inline styles con url() (raro en el manual, pero que no salga a la red).
  await Promise.all(
    Array.from(clone.querySelectorAll<HTMLElement>("[style*='url(']")).map(async (el) => {
      el.setAttribute("style", await resolveUrls(el.getAttribute("style") ?? "", document.baseURI, true, cache));
    }),
  );

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    `<!doctype html><html${attrs(document.documentElement)}><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head>` +
    `<body${attrs(document.body)}>${clone.outerHTML}</body></html>`
  );
}

/** Ofrece `blob` como descarga con el nombre `fileName`. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nombre de fichero seguro a partir del título del manual. */
export function pdfFileName(...parts: (string | undefined)[]): string {
  const base = parts
    .filter(Boolean)
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "Manual"}.pdf`;
}
