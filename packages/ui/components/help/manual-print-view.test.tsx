import { describe, it, expect, afterEach, vi } from "vitest";
import { lazy } from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/manual/imprimir",
}));

import { ManualPrintView, runningHeaderCss, runningHeaderText } from "./manual-print-view";

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
        <section id="proforma">
          <h2>Proforma</h2>
          <h3 style={{ fontSize: "16px" }}>
            Detalle de la proforma<span style={{ fontSize: "12px" }}>Solo si está contratado</span>
          </h3>
        </section>
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

    // #29 — El índice recoge los títulos (h2) y subtítulos (h3) de cada sección,
    // con un ancla única y su número de página (en jsdom todo mide 0: misma
    // página que la sección, que empieza tras la portada y el índice).
    const tocH2 = screen.getByRole("link", { name: "Proforma" });
    expect(tocH2.closest("[data-manual-print-toc]")).toBeTruthy();
    const h2 = container.querySelector("[data-manual-print-section] h2")!;
    expect(tocH2.getAttribute("href")).toBe(`#${h2.id}`);
    expect(h2.id.startsWith("mp-copias-")).toBe(true);
    // La nota en letra menor del subtítulo no pasa al índice.
    expect(screen.getByRole("link", { name: "Detalle de la proforma" })).toBeTruthy();
    expect(tocH2.parentElement!.textContent).toContain("4");

    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("#29 — con pdfEndpoint, «Descargar PDF» manda la vista autocontenida y descarga el PDF", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return { ok: true, status: 200, blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const createUrl = vi.fn(() => "blob:pdf");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const clicks: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });

    render(
      <ManualPrintView
        sections={[{ key: "home", title: "Inicio", href: "/manual" }]}
        resolve={() => Home}
        appName="MycoLegal Peticiones"
        audience="Manual de gestoría"
        language="CAST"
        pdfEndpoint="/api/manual/pdf"
      />,
    );
    const download = screen.getByRole("button", { name: /ui.manualPrint.download/ }) as HTMLButtonElement;
    expect(screen.getByRole("button", { name: /ui.manualPrint.printOnly/ })).toBeTruthy();
    await waitFor(() => expect(download.disabled).toBe(false));

    fireEvent.click(download);
    await waitFor(() => expect(clicks).toEqual(["MycoLegal Peticiones - Manual de gestoría.pdf"]));
    const call = fetchMock.mock.calls.find(([u]) => u === "/api/manual/pdf")!;
    expect(call[1]!.method).toBe("POST");
    const body = JSON.parse(String(call[1]!.body)) as { html: string; fileName: string };
    expect(body.fileName).toBe("MycoLegal Peticiones - Manual de gestoría.pdf");
    expect(body.html.startsWith("<!doctype html>")).toBe(true);
    expect(body.html).toContain("data-manual-print-toc");
    expect(body.html).not.toMatch(/<div[^>]*data-manual-print-toolbar/);

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("#999 — encabezado de página con el apartado", () => {
  it("grupo › título, sin repetir el grupo", () => {
    expect(runningHeaderText({ title: "2. Peticiones", group: "Copias de terceros" })).toBe("Copias de terceros › 2. Peticiones");
    expect(runningHeaderText({ title: "1. Copias de terceros", group: "Copias de terceros" })).toBe("1. Copias de terceros");
    expect(runningHeaderText({ title: "Inicio" })).toBe("Inicio");
  });
  it("una página con nombre por sección, con su @top-left (comillas escapadas)", () => {
    const css = runningHeaderCss([
      { key: "home", title: "Inicio" },
      { key: "peticiones", title: 'Peticiones "nuevas"', group: "Copias" },
    ]);
    expect(css).toContain('[data-manual-print-section="home"] { page: mp-sec-0; }');
    expect(css).toContain("@page mp-sec-1 { @top-left { content: \"Copias › Peticiones \\\"nuevas\\\"\";");
  });
  it("sin la prop no se añade; con ella, el <style> va en la vista", () => {
    const one = render(
      <ManualPrintView sections={[{ key: "home", title: "Inicio" }]} resolve={() => Home} appName="App" runningHeader />,
    );
    expect(one.container.innerHTML).toContain("mp-sec-0");
    cleanup();
    const two = render(<ManualPrintView sections={[{ key: "home", title: "Inicio" }]} resolve={() => Home} appName="App" />);
    expect(two.container.innerHTML).not.toContain("mp-sec-0");
  });
});
