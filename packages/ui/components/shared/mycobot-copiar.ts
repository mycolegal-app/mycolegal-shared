import { renderMarkdown } from "./markdown";

/**
 * #1057 — Copiar respuestas de MycoBot para pegarlas en Word.
 *
 * Copiar el Markdown tal cual dejaba en Word los `**`, los `###` y las rayas: el notario
 * tenía que limpiarlos a mano en cada descripción. Ahora se copia en HTML (lo que pega
 * Word con formato) y en texto plano (lo que pega un editor de texto).
 */

/**
 * Cabecera con la que el programa de división horizontal (consultor,
 * `src/lib/skills/dh/descripciones.ts` › `CABECERA_DESCRIPCIONES_DH`) abre las
 * descripciones. La pone el PROGRAMA, no la IA, así que identifica la respuesta.
 * Si se cambia allí, hay que cambiarla aquí.
 */
export const CABECERA_DESCRIPCIONES_DH = "**Descripciones generadas por el programa de división horizontal de MycoBot**";

/**
 * Solo las descripciones de las entidades de una respuesta de la skill de división
 * horizontal: lo que va después del párrafo de cabecera del programa y antes de
 * «### COMPROBACIONES». `null` si la respuesta no las trae.
 */
export function extraerDescripcionesDH(texto: string): string | null {
  const i = texto.indexOf(CABECERA_DESCRIPCIONES_DH);
  if (i < 0) return null;
  // La cabecera es un párrafo: las descripciones empiezan tras la línea en blanco.
  const finCab = texto.indexOf("\n\n", i);
  if (finCab < 0) return null;
  let cuerpo = texto.slice(finCab + 2);
  const comp = cuerpo.search(/^#{1,6}\s*COMPROBACIONES\b/m);
  if (comp >= 0) cuerpo = cuerpo.slice(0, comp);
  // El separador que precede a las comprobaciones no es parte de las descripciones.
  cuerpo = cuerpo.replace(/(\n\s*(\*{3,}|-{3,}|_{3,})\s*)+\s*$/, "").trim();
  return cuerpo || null;
}

/** Markdown → texto plano legible (sin `**`, `#`, `>` de cita ni rayas). */
export function markdownATextoPlano(md: string): string {
  return md
    .split("\n")
    .filter((l) => !/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(l))
    .map((l) => l.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*>\s?/, ""))
    .join("\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Copia al portapapeles en HTML (con el mismo render que se usa al imprimir) y en
 * texto plano. Si el navegador no tiene `ClipboardItem` (o lo rechaza), copia solo
 * el texto. Lanza si el portapapeles no está disponible.
 */
export async function copiarHtmlYTexto(markdown: string, textoPlano: string): Promise<void> {
  const html = `<meta charset="utf-8"><div>${renderMarkdown(markdown)}</div>`;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([textoPlano], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Algunos navegadores rechazan el HTML: se cae al texto.
    }
  }
  await navigator.clipboard.writeText(textoPlano);
}
