import { describe, it, expect, afterEach, vi } from "vitest";
import { lazy } from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/manual/imprimir",
}));

import { ManualPrintView } from "./manual-print-view";

// Sin I18nProvider, `t` devuelve la clave: los textos se buscan por clave.
afterEach(cleanup);

function Home() {
  return (
    <div>
      <h1>Inicio</h1>
      <a href="/manual/copias#proforma">ver proforma</a>
      <a href="/manual/otra">sección ausente</a>
      <a href="https://example.com">externo</a>
    </div>
  );
}

let release: () => void = () => {};
const gate = new Promise<void>((r) => {
  release = r;
});
const Copias = lazy(async () => {
  await gate;
  return {
    default: () => (
      <div>
        <h1>Copias</h1>
        <section id="proforma">Proforma</section>
        <details>
          <summary>Pregunta</summary>
          Respuesta
        </details>
      </div>
    ),
  };
});

const resolve = (_lang: string, key: "home" | "copias") => (key === "home" ? Home : Copias);

describe("#905 — ManualPrintView", () => {
  it("espera a todas las secciones, abre los <details> y reescribe los enlaces internos", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { container } = render(
      <ManualPrintView
        sections={[
          { key: "home", title: "Inicio", href: "/manual" },
          { key: "copias", title: "Copias", href: "/manual/copias", group: "Copias" },
        ]}
        resolve={resolve}
        appName="MycoLegal Tramitación"
        audience="Manual de gestoría"
        language="CAST"
      />,
    );

    const button = screen.getByRole("button", { name: /ui.manualPrint.print/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Manual de gestoría")).toBeTruthy();
    expect(container.querySelectorAll("[data-manual-print-section]")).toHaveLength(2);

    release();
    await waitFor(() => expect(button.disabled).toBe(false));

    const details = container.querySelector("details")!;
    expect(details.open).toBe(true);

    const toProforma = screen.getByText("ver proforma");
    expect(toProforma.getAttribute("href")).toBe("#proforma");
    expect(screen.getByText("sección ausente").hasAttribute("href")).toBe(false);
    expect(screen.getByText("externo").getAttribute("href")).toBe("https://example.com");
    expect(screen.getByRole("link", { name: "Copias" }).getAttribute("href")).toBe("#mp-copias");

    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});
