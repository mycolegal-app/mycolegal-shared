import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// next/link real necesita el router montado; aquí basta un <a> que pase el clic.
vi.mock("next/link", () => ({
  default: ({ href, prefetch: _p, ...rest }: any) => <a href={String(href)} {...rest} />,
}));

const ORIGEN = "https://tramitacion.mycolegal.app";
let ubicacion: { href: string; readonly origin: string; readonly pathname: string; readonly search: string };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  ubicacion = {
    href: `${ORIGEN}/expedientes`,
    get origin() { return new URL(this.href, ORIGEN).origin; },
    get pathname() { return new URL(this.href, ORIGEN).pathname; },
    get search() { return new URL(this.href, ORIGEN).search; },
  };
  Object.defineProperty(window, "location", { configurable: true, get: () => ubicacion });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function pintar(spa: boolean, href = "/agenda") {
  if (spa) vi.stubEnv("NEXT_PUBLIC_NAVEGACION_SPA", "1");
  const { NavLink } = await import("./nav-link");
  render(<NavLink href={href}>Agenda</NavLink>);
  return screen.getByText("Agenda");
}

describe("NavLink", () => {
  it("sin el interruptor: recarga la página entera, como siempre", async () => {
    const a = await pintar(false);
    const ev = fireEvent.click(a);
    expect(ev).toBe(false); // preventDefault
    expect(ubicacion.href).toBe("/agenda");
  });

  it("con el interruptor: deja navegar a Next y no recarga si la URL cambia", async () => {
    const a = await pintar(true);
    expect(fireEvent.click(a)).toBe(true); // sin preventDefault: navega Next
    ubicacion.href = `${ORIGEN}/agenda`; // Next ha navegado
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.advanceTimersByTime(5_000);
    expect(ubicacion.href).toBe(`${ORIGEN}/agenda`);
    expect(aviso).not.toHaveBeenCalled();
  });

  it("con el interruptor: si a los 5 s sigue en la misma URL, recarga y lo avisa", async () => {
    const a = await pintar(true);
    fireEvent.click(a);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.advanceTimersByTime(4_999);
    expect(ubicacion.href).toBe(`${ORIGEN}/expedientes`);
    vi.advanceTimersByTime(1);
    expect(ubicacion.href).toBe(`${ORIGEN}/agenda`);
    expect(aviso.mock.calls[0][0]).toContain("[navlink-respaldo]");
  });

  it("con el interruptor: la misma ruta con otra query sigue recargando (filtros leídos al montar)", async () => {
    const a = await pintar(true, "/expedientes?estado=abierto");
    expect(fireEvent.click(a)).toBe(false);
    expect(ubicacion.href).toBe("/expedientes?estado=abierto");
  });

  it("con el interruptor y cambios sin guardar: pregunta y, si no se confirma, no navega", async () => {
    const a = await pintar(true);
    const { useAvisoSalida } = await import("../../hooks/use-aviso-salida");
    const { renderHook } = await import("@testing-library/react");
    renderHook(() => useAvisoSalida(true, "¿Salir?"));
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(fireEvent.click(a)).toBe(false); // preventDefault: Next no navega
    expect(confirmar).toHaveBeenCalledWith("¿Salir?");
    vi.advanceTimersByTime(10_000);
    expect(ubicacion.href).toBe(`${ORIGEN}/expedientes`); // ni el respaldo
  });

  it("cmd+clic sigue abriendo pestaña nueva en los dos modos", async () => {
    const a = await pintar(true);
    expect(fireEvent.click(a, { metaKey: true })).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(ubicacion.href).toBe(`${ORIGEN}/expedientes`);
  });
});
