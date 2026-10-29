import { describe, it, expect } from "vitest";
import { CABECERA_DESCRIPCIONES_DH, extraerDescripcionesDH, markdownATextoPlano } from "./mycobot-copiar";

const RESPUESTA_DH = [
  "He redactado 2 entidades. La suma de coeficientes da 100,00 %.",
  "---",
  `${CABECERA_DESCRIPCIONES_DH} a partir del Excel (2 entidades; …).`,
  "### ENTIDAD NÚMERO UNO.-",
  "VIVIENDA libre, situada en planta BAJA del edificio X.",
  "Tiene una superficie construida total de **ochenta metros cuadrados (80,00 m2)**.",
  "### ENTIDAD NÚMERO DOS.-",
  "> **[ALERTA: falta la planta]**",
  "TRASTERO señalado con el número uno.",
  "---",
  "### COMPROBACIONES\n- Entidades: 2.",
].join("\n\n");

describe("extraerDescripcionesDH (#1057)", () => {
  it("devuelve solo las entidades: sin la explicación, la cabecera ni las comprobaciones", () => {
    const d = extraerDescripcionesDH(RESPUESTA_DH)!;
    expect(d.startsWith("### ENTIDAD NÚMERO UNO.-")).toBe(true);
    expect(d.endsWith("TRASTERO señalado con el número uno.")).toBe(true);
    expect(d).not.toContain("COMPROBACIONES");
    expect(d).not.toContain("He redactado");
    expect(d).not.toContain("programa de división horizontal");
  });

  it("null en una respuesta que no es del programa", () => {
    expect(extraerDescripcionesDH("La ENTIDAD NÚMERO UNO es una vivienda.")).toBeNull();
  });
});

describe("markdownATextoPlano", () => {
  it("quita negritas, almohadillas, citas y rayas", () => {
    const t = markdownATextoPlano(extraerDescripcionesDH(RESPUESTA_DH)!);
    expect(t).toContain("ENTIDAD NÚMERO UNO.-\n\nVIVIENDA libre");
    expect(t).toContain("ochenta metros cuadrados (80,00 m2)");
    expect(t).toContain("[ALERTA: falta la planta]");
    expect(t).not.toMatch(/\*\*|^#|^>|^---/m);
  });
});
