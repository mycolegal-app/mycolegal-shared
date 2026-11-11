import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useAvisoSalida, confirmarSalida } from "./use-aviso-salida";

// Sin I18nProvider, `t` devuelve la clave: el mensaje por defecto se reconoce por ella.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const esperarPopstate = () => new Promise<void>((r) => window.addEventListener("popstate", () => r(), { once: true }));

describe("useAvisoSalida", () => {
  it("sin cambios no pregunta; con cambios pregunta con el mensaje y respeta la respuesta", () => {
    const confirmar = vi.spyOn(window, "confirm");
    expect(confirmarSalida()).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();

    const { rerender } = renderHook(({ activo }) => useAvisoSalida(activo), { initialProps: { activo: true } });
    confirmar.mockReturnValueOnce(false);
    expect(confirmarSalida()).toBe(false);
    expect(confirmar).toHaveBeenCalledWith("ui.common.unsavedLeave");
    confirmar.mockReturnValueOnce(true);
    expect(confirmarSalida()).toBe(true);

    rerender({ activo: false }); // guardado
    confirmar.mockClear();
    expect(confirmarSalida()).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("mantiene beforeunload para las salidas que recargan, y lo quita al guardar", () => {
    const { rerender } = renderHook(({ activo }) => useAvisoSalida(activo, "¿Salir?"), { initialProps: { activo: true } });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    rerender({ activo: false });
    const ev2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
  });

  it("«atrás» con cambios: pregunta; si no se confirma, se queda en la página", async () => {
    window.history.replaceState({ next: "estado" }, "", "/paginas");
    renderHook(() => useAvisoSalida(true, "¿Salir?"));
    expect(window.history.state).toEqual({ next: "estado", __avisoSalida: true }); // conserva el estado de Next
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    const largo = window.history.length;
    window.history.back();
    await esperarPopstate();
    expect(confirmar).toHaveBeenCalledWith("¿Salir?");
    expect(window.location.pathname).toBe("/paginas");
    expect(window.history.state.__avisoSalida).toBe(true); // vuelve a poner la guarda
    expect(window.history.length).toBe(largo);
  });

  it("«atrás» con cambios confirmado: deja de avisar y sale", async () => {
    renderHook(() => useAvisoSalida(true, "¿Salir?"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const atras = vi.spyOn(window.history, "back");
    window.history.back();
    await esperarPopstate();
    expect(atras).toHaveBeenCalledTimes(2); // el del usuario y el que sale de verdad
    expect(confirmarSalida()).toBe(true);
  });
});
