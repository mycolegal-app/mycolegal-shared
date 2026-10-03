// Guardián del mapa de estilos por CLASE de la Biblioteca Legal.
//
// POR QUÉ EXISTE. Cada clase nueva hay que declararla en tres sitios: el enum de
// Prisma, la lista blanca del filtro del Consultor y la presentación (color, icono
// y etiqueta). Los dos primeros ya tienen guardián en `mycolegal-consultor`
// (`test:resoluciones-clases`, #691/#692/#946); este cubre el tercero: cuando #905
// añadió SISTEMA_REGISTRAL, el rail de MycoBot y el modal de Fuentes la pintaron en
// gris y sin icono, y a INSTRUCCIONES_DGSJFP y APORTACION_ORG les faltaba además la
// etiqueta, así que salía el código crudo en la pastilla.
//
// Se comprueba contra las etiquetas de `i18n/cast.json`: estilo y etiqueta tienen
// que cubrir exactamente las mismas clases, en los dos sentidos.

import { describe, it, expect } from "vitest";
import { CLASE_ESTILO, claseEstilo, CLASE_ESTILO_FALLBACK } from "./clase-estilo";
import cast from "../i18n/cast.json";

const etiquetadas = Object.keys(
  (cast as { ui: { mycobot: { clases: Record<string, string> } } }).ui.mycobot.clases,
);
const estilizadas = Object.keys(CLASE_ESTILO);

describe("CLASE_ESTILO", () => {
  it("toda clase con etiqueta tiene color e icono", () => {
    expect(etiquetadas.filter((c) => !estilizadas.includes(c))).toEqual([]);
  });

  it("toda clase con color e icono tiene etiqueta larga y corta", () => {
    const { clases, clasesCorto } = (
      cast as {
        ui: { mycobot: { clases: Record<string, string>; clasesCorto: Record<string, string> } };
      }
    ).ui.mycobot;
    expect(estilizadas.filter((c) => !clases[c] || !clasesCorto[c])).toEqual([]);
  });

  it("una clase sin mapear cae al gris de cortesía, no a undefined", () => {
    expect(claseEstilo("NO_EXISTE")).toBe(CLASE_ESTILO_FALLBACK);
    expect(claseEstilo(null)).toBe(CLASE_ESTILO_FALLBACK);
  });

  it("ninguna clase comparte el acento de categoría con otra (#911b)", () => {
    // El acento es el único sitio donde el color dice "de qué categoría es": dos
    // bandas iguales se leen como la misma categoría. OTROS reusa el gris del
    // fallback a propósito.
    const acentos = Object.entries(CLASE_ESTILO)
      .filter(([c]) => c !== "OTROS")
      .map(([, e]) => e.acento);
    expect(acentos.length).toBe(new Set(acentos).size);
  });
});
