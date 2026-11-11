import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("suscribirNoLeidas", () => {
  let visible = "visible";
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    visible = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const respuesta = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
  const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]));

  it("campana y barra comparten una petición y reciben total y por app", async () => {
    const f = vi.fn(async () => respuesta({ byApp: { notaria: 2 }, unread: 3 }));
    vi.stubGlobal("fetch", f);
    const { suscribirNoLeidas } = await import("./no-leidas");
    const campana = vi.fn();
    const barra = vi.fn();
    const bajas = [
      suscribirNoLeidas("/api/notifications", campana),
      suscribirNoLeidas("/api/notifications", barra),
    ];
    await vi.waitFor(() => expect(campana).toHaveBeenCalled());
    expect(urls(f)).toEqual(["/api/notifications/unread-by-app"]);
    expect(campana).toHaveBeenCalledWith({ unread: 3, byApp: { notaria: 2 } });
    expect(barra).toHaveBeenCalledWith({ unread: 3, byApp: { notaria: 2 } });
    bajas.forEach((b) => b()); // sin esto sus listeners siguen vivos en el test siguiente
  });

  it("cada 90 s, nada con la pestaña oculta y al volver refresca en el acto", async () => {
    const f = vi.fn(async () => respuesta({ byApp: {}, unread: 0 }));
    vi.stubGlobal("fetch", f);
    const { suscribirNoLeidas } = await import("./no-leidas");
    const baja = suscribirNoLeidas("/api/notifications", () => {});
    await vi.advanceTimersByTimeAsync(90_000);
    expect(f).toHaveBeenCalledTimes(2);
    visible = "hidden";
    await vi.advanceTimersByTimeAsync(10 * 90_000);
    expect(f).toHaveBeenCalledTimes(2);
    visible = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(f).toHaveBeenCalledTimes(3);
    baja();
    await vi.advanceTimersByTimeAsync(10 * 90_000);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("si auth aún no trae el total, lo pide aparte a unread-count", async () => {
    const f = vi.fn(async (url: string) =>
      respuesta(url.endsWith("unread-by-app") ? { byApp: { notaria: 1 } } : { unread: 4 }),
    );
    vi.stubGlobal("fetch", f);
    const { suscribirNoLeidas } = await import("./no-leidas");
    const o = vi.fn();
    const baja = suscribirNoLeidas("/api/notifications", o);
    await vi.waitFor(() => expect(o).toHaveBeenCalled());
    expect(o).toHaveBeenCalledWith({ unread: 4, byApp: { notaria: 1 } });
    baja();
  });
});
