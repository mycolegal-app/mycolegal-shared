import { describe, it, expect } from "vitest";
import { normalizarLatex, renderMarkdown } from "./markdown";

describe("normalizarLatex", () => {
  it("#48 — desmonta comandos anidados y las fórmulas sin comandos de letras", () => {
    expect(normalizarLatex("104.000 × 51 % = $\\mathbf{53.040,00\\,\\text{€}}$")).toBe("104.000 × 51 % = 53.040,00 €");
    expect(normalizarLatex("es del 51 % ($100\\,\\% - 49\\,\\%$).")).toBe("es del 51 % (100 % - 49 %).");
    expect(normalizarLatex("total \\mathbf{\\text{53.040,00 €}}")).toBe("total 53.040,00 €");
    expect(normalizarLatex("entre $5 y $6")).toBe("entre $5 y $6");
  });

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

describe("el rail y el informe comparten renderizador", () => {
  // #31 (Lara, 28-sep-2026): la cadena exacta que el chat enseñaba en crudo.
  it("desmonta el LaTeX del coeficiente multiplicador del ISD", () => {
    expect(
      renderMarkdown("$$\\text{22.068,00 €} \\times 1,1000 = \\mathbf{24.274,80\\ €}$$ [1]."),
    ).toContain("22.068,00 € × 1,1000 = 24.274,80 € [1].");
  });
});

describe("renderMarkdown — formato inline (#52 consultor)", () => {
  it("pinta el color, la negrita y el subrayado que pide conservar la plantilla", () => {
    const html = renderMarkdown('<span style="color:#b30000; font-weight:bold;">CASO NORMAL</span> que <u>NO</u> es');
    expect(html).toContain('<span style="color:#b30000;font-weight:bold">CASO NORMAL</span>');
    expect(html).toContain("<u>NO</u>");
    expect(html).not.toContain("&lt;span");
  });

  it("quita del estilo lo que no es formato y neutraliza el resto de HTML", () => {
    const html = renderMarkdown('<span style="color:red; background:url(x); position:fixed">a</span> <script>alert(1)</script> <b onclick="x">b</b> <img src=x>');
    expect(html).toContain('<span style="color:red">a</span>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b onclick=");
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<(script|img|b )/);
  });

  it("deja igual el markdown sin etiquetas", () => {
    expect(renderMarkdown("**hola** 3 < 4")).toBe("<p><strong>hola</strong> 3 &lt; 4</p>\n");
  });
});
