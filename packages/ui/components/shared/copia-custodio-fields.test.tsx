import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CopiaCustodioFields } from "./copia-custodio-fields";
import { copiaAltaInicial, type CopiaAltaValues } from "../../lib/copia-alta";

// Sin I18nProvider, `t` devuelve la clave: los textos se buscan por clave.
let ultimo: CopiaAltaValues = copiaAltaInicial();
function Harness({ refs = true, extra }: { refs?: boolean; extra?: React.ReactNode }) {
  const [v, setV] = useState<CopiaAltaValues>(copiaAltaInicial);
  ultimo = v;
  return (
    <CopiaCustodioFields value={v} onChange={(x) => { ultimo = x; setV(x); }} refsEntidadVisibles={refs} sedasAyuda={<span>AYUDA-SEDAS</span>}>
      {extra}
    </CopiaCustodioFields>
  );
}
const selects = () => screen.getAllByRole("combobox") as HTMLSelectElement[];

afterEach(cleanup);

describe("#872 — bloque «Datos de la copia» compartido", () => {
  it("cambiar de modo arrastra documento y subtipo por defecto", () => {
    render(<Harness />);
    fireEvent.change(selects()[0], { target: { value: "TESTIMONIO_POLIZA" } });
    expect(ultimo).toMatchObject({ modo: "TESTIMONIO_POLIZA", tipoDocumento: "POLIZA", tipoCopia: "TESTIMONIO_EJECUTIVO" });
    // En póliza el campo es «Nº de asiento», no de protocolo.
    expect(screen.getByText("copiaCustodio.asiento")).toBeTruthy();
  });

  it("CEE: el segundo desplegable elige el documento y el tipo queda fijo", () => {
    render(<Harness />);
    fireEvent.change(selects()[0], { target: { value: "CEE" } });
    fireEvent.change(selects()[1], { target: { value: "POLIZA" } });
    expect(ultimo).toMatchObject({ tipoDocumento: "POLIZA", tipoCopia: "TITULO_EJECUTIVO_EUROPEO" });
  });

  it("la copia parcial hace aparecer su contenido (obligatorio)", () => {
    render(<Harness />);
    expect(screen.queryByText(/copiaCustodio.parteParcial \*/)).toBeNull();
    fireEvent.change(selects()[1], { target: { value: "AUTENTICA_PARCIAL_EJECUTIVA" } });
    expect(screen.getByText(/copiaCustodio.parteParcial \*/)).toBeTruthy();
  });

  it("#835 — referencias de la entidad solo si se piden", () => {
    render(<Harness refs={false} />);
    expect(screen.queryByText("copiaCustodio.sedasOficina")).toBeNull();
    expect(screen.queryByText("AYUDA-SEDAS")).toBeNull();
    cleanup();
    render(<Harness refs />);
    expect(screen.getByText("copiaCustodio.sedasOficina")).toBeTruthy();
    expect(screen.getByText("AYUDA-SEDAS")).toBeTruthy();
  });

  it("entidad de origen y campos propios de la pantalla", () => {
    render(<Harness extra={<p>SOLO-NOTARIA</p>} />);
    fireEvent.change(selects()[2], { target: { value: "Banco de Sabadell, S.A." } });
    expect(ultimo.entidadOrigen).toBe("Banco de Sabadell, S.A.");
    expect(screen.getByText("SOLO-NOTARIA")).toBeTruthy();
    // #19 — rótulo del NIF unificado (clave del paquete, no la de cada app).
    expect(screen.getByText("copiaCustodio.titularNif")).toBeTruthy();
  });
});
