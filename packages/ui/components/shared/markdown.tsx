import * as React from "react";
import { marked } from "marked";

/**
 * Render de Markdown a HTML para uso compartido (resúmenes de resoluciones
 * editados por el revisor, respuestas del bot, etc.). El texto viene siempre
 * de fuentes internas (LLM o editor de personal con permiso), pero
 * neutralizamos `<` para impedir HTML crudo y XSS — la sintaxis markdown
 * (negritas, listas, encabezados, citas con `>`…) no la usa.
 *
 * Si necesitas pasar el HTML resultante a otro componente, usa
 * `renderMarkdown(text)`; si solo quieres pintarlo, monta `<Markdown />`.
 */

marked.setOptions({ breaks: true, gfm: true });

/**
 * Los LLM escriben a veces las cifras y operaciones en notación LaTeX
 * (`$500,00\ \text{€} + 47.500,00\ \text{€}$`, `$73,23\ \text{m}^2$`) y aquí no hay
 * motor matemático: el usuario veía los códigos tal cual en el informe del Revisor
 * y en su PDF. Se pasa a texto plano: se quitan los `$…$`, `\text{…}` deja su
 * contenido, los espacios y símbolos escapados vuelven a serlo, `^2`/`^3` pasan a
 * superíndice y `\frac{a}{b}` a `a/b`. Solo se tratan como fórmula los `$…$` que
 * traen un comando LaTeX o no llevan espacios sueltos, para no comerse importes
 * en dólares de un texto normal («$5 y $6»).
 */
const CMD_TEXTO = /\\(?:text|mathrm|textrm|mathit|textbf|mathbf|operatorname)\{([^{}]*)\}/g;
const SUPER: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

function desmontarLatex(f: string): string {
  return f
    .replace(CMD_TEXTO, "$1")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\^\{?(\d)\}?/g, (_, d: string) => SUPER[d] ?? `^${d}`)
    .replace(/\\(?:times|cdot)\b/g, "×")
    .replace(/\\(?:le|leq)\b/g, "≤")
    .replace(/\\(?:ge|geq)\b/g, "≥")
    .replace(/\\neq?\b/g, "≠")
    .replace(/\\euro\b/g, "€")
    .replace(/\\[,;:!]|\\ /g, " ")
    .replace(/\\([%$&#_{}])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizarLatex(text: string): string {
  if (!text.includes("$") && !text.includes("\\")) return text;
  return (
    text
      // Bloques $$…$$ y $…$ en una misma línea. Es fórmula si lleva un comando
      // (\text, \frac…) o si no contiene espacios sin escapar.
      .replace(/\$\$([^$\n]+)\$\$|\$([^$\n]+)\$/g, (m, a?: string, b?: string) => {
        const inner = (a ?? b ?? "").trim();
        const esFormula = /\\[A-Za-z]/.test(inner) || !/(^|[^\\])\s/.test(inner);
        return esFormula ? desmontarLatex(inner) : m;
      })
      // Comandos sueltos fuera de $…$ (`\text{€}` sin delimitar).
      .replace(CMD_TEXTO, "$1")
  );
}

export function renderMarkdown(text: string): string {
  return marked.parse(normalizarLatex(text).replace(/</g, "&lt;"), { async: false }) as string;
}

interface MarkdownProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Texto markdown. Vacío/nulo → componente no renderiza nada. */
  children?: string | null;
}

/**
 * Renderiza un bloque de markdown como HTML. Hereda el className para que el
 * llamador aplique tipografía/espaciados (clases `prose` u otras). No añade
 * estilos por defecto: si quieres negritas visibles, asegura `prose` o reglas
 * propias en el contenedor padre.
 */
export function Markdown({ children, className, ...rest }: MarkdownProps): React.ReactElement | null {
  if (!children || !children.trim()) return null;
  return (
    <div
      {...rest}
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(children) }}
    />
  );
}
