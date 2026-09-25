import { describe, it, expect } from "vitest";
import { esquinaMasCercana, CORNER_CLASSES } from "./use-floating-corner";

// #889 — Javier, sobre el arreglo de #875: "el asa aparece pero ni con ella ni
// con el botón derecho se mueve". El icono es un agarre y prometía arrastre,
// pero sólo abría un menú al hacer clic. Ahora se arrastra y al soltar ancla a
// la esquina del cuadrante donde se suelte.

const W = 1000;
const H = 800;

describe("esquinaMasCercana", () => {
  it("cuadrante superior izquierdo", () => {
    expect(esquinaMasCercana(10, 10, W, H)).toBe("top-left");
  });

  it("cuadrante superior derecho", () => {
    expect(esquinaMasCercana(W - 10, 10, W, H)).toBe("top-right");
  });

  it("cuadrante inferior izquierdo", () => {
    expect(esquinaMasCercana(10, H - 10, W, H)).toBe("bottom-left");
  });

  it("cuadrante inferior derecho", () => {
    expect(esquinaMasCercana(W - 10, H - 10, W, H)).toBe("bottom-right");
  });

  it("justo antes del centro cae arriba-izquierda", () => {
    expect(esquinaMasCercana(W / 2 - 1, H / 2 - 1, W, H)).toBe("top-left");
  });

  it("el centro exacto cae abajo-derecha (el `<` es estricto), y es esquina válida igual", () => {
    const c = esquinaMasCercana(W / 2, H / 2, W, H);
    expect(c).toBe("bottom-right");
    expect(CORNER_CLASSES[c]).toBeDefined();
  });

  it("siempre devuelve una de las cuatro esquinas con clase conocida", () => {
    for (const [x, y] of [
      [0, 0],
      [W, H],
      [0, H],
      [W, 0],
      [W / 3, (H * 2) / 3],
    ]) {
      expect(CORNER_CLASSES[esquinaMasCercana(x, y, W, H)]).toBeTruthy();
    }
  });

  it("nunca deja el botón fuera de pantalla: las clases son anclajes, no coordenadas", () => {
    // La garantía de #875: posiciones discretas. Ninguna clase lleva un valor
    // calculado que pueda caer fuera del viewport al cambiar de monitor.
    for (const clases of Object.values(CORNER_CLASSES)) {
      expect(clases).toMatch(/^(top|bottom)-\d+ (left|right)-\d+$/);
    }
  });
});
