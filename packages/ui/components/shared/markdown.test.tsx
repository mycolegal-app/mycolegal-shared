import { describe, it, expect } from "vitest";
import { normalizarLatex, renderMarkdown } from "./markdown";

describe("normalizarLatex", () => {
  it("pasa a texto plano las cifras con LaTeX que escribe el Revisor", () => {
    expect(normalizarLatex("suma ($500,00\\ \\text{€} + 47.500,00\\ \\text{€} = 48.000,00\\ \\text{€}$) coincide"))
      .toBe("suma (500,00 € + 47.500,00 € = 48.000,00 €) coincide");
    expect(normalizarLatex("precio total fijado ($48.000,00\\ \\text{€}$)")).toBe("precio total fijado (48.000,00 €)");
    expect(normalizarLatex("superficie de $73,23\\ \\text{m}^2$ y cuota del $1,555%$."))
      .toBe("superficie de 73,23 m² y cuota del 1,555%.");
    expect(normalizarLatex("cuota del $1,555\\%$")).toBe("cuota del 1,555%");
  });

  it("desmonta fracciones, productos y bloques $$…$$", () => {
    expect(normalizarLatex("$$\\frac{1}{3} \\times 90.000$$")).toBe("1/3 × 90.000");
    expect(normalizarLatex("$\\mathrm{m}^{2}$")).toBe("m²");
  });

  it("limpia \\text{} suelto fuera de delimitadores", () => {
    expect(normalizarLatex("48.000,00 \\text{€}")).toBe("48.000,00 €");
  });

  it("no toca dólares de un texto normal ni texto sin fórmulas", () => {
    expect(normalizarLatex("cuesta $5 y $6 al día")).toBe("cuesta $5 y $6 al día");
    expect(normalizarLatex("La parte vendedora recibe 48.000,00 €.")).toBe("La parte vendedora recibe 48.000,00 €.");
    expect(normalizarLatex("línea $a\n b$ partida")).toBe("línea $a\n b$ partida");
  });

  it("renderMarkdown aplica la normalización", () => {
    expect(renderMarkdown("**Cuadra:** $500,00\\ \\text{€}$")).toContain("<strong>Cuadra:</strong> 500,00 €");
  });
});
