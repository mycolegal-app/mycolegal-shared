import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("suscribirContadoresForo", () => {
  let visible = "visible";
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    visible = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const respuesta = (status: number, json: unknown = {}) => ({ ok: status < 400, status, json: async () => json });
  const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]));

  it("dos lanzadores comparten una petición a /badge y reciben no leídos y reportes", async () => {
    const f = vi.fn(async () => respuesta(200, { data: { unread: { unread: 3 }, moderation: [{}, {}] } }));
    vi.stubGlobal("fetch", f);
    const { suscribirContadoresForo } = await import("./foro-badge");
    const a = vi.fn();
    const b = vi.fn();
    const bajas = [suscribirContadoresForo(a, true), suscribirContadoresForo(b, true)];
    await vi.waitFor(() => expect(a).toHaveBeenCalled());
    expect(urls(f)).toEqual(["/api/foro/badge"]);
    expect(a).toHaveBeenCalledWith({ unread: 3, modCount: 2 });
    expect(b).toHaveBeenCalledWith({ unread: 3, modCount: 2 });
    bajas.forEach((x) => x());
  });

  it("moderation null = no moderador → sin marca", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(200, { data: { unread: { unread: 0 }, moderation: null } })));
    const { suscribirContadoresForo } = await import("./foro-badge");
    const o = vi.fn();
    const baja = suscribirContadoresForo(o, true);
    await vi.waitFor(() => expect(o).toHaveBeenCalledWith({ unread: 0, modCount: 0 }));
    baja();
  });

  it("cada 90 s, nada con la pestaña oculta y al volver refresca en el acto", async () => {
    const f = vi.fn(async () => respuesta(200, { data: { unread: { unread: 0 }, moderation: null } }));
    vi.stubGlobal("fetch", f);
    const { suscribirContadoresForo } = await import("./foro-badge");
    const baja = suscribirContadoresForo(() => {}, true);
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

  it("sin /badge (404) usa las dos peticiones de antes y no lo reintenta; tras 403 deja moderación", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith("/badge")) return respuesta(404);
      if (url.endsWith("/unread")) return respuesta(200, { data: { unread: 5 } });
      return respuesta(403);
    });
    vi.stubGlobal("fetch", f);
    const { suscribirContadoresForo } = await import("./foro-badge");
    const o = vi.fn();
    const baja = suscribirContadoresForo(o, true);
    await vi.waitFor(() => expect(o).toHaveBeenCalled());
    expect(o).toHaveBeenLastCalledWith({ unread: 5, modCount: 0 });
    expect(urls(f)).toEqual(["/api/foro/badge", "/api/foro/unread", "/api/foro/moderation"]);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(urls(f).slice(3)).toEqual(["/api/foro/unread"]);
    baja();
  });

  it("respaldo con moderador: cuenta la lista; silenciado no pide /unread", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith("/badge")) return respuesta(405);
      if (url.endsWith("/unread")) return respuesta(200, { data: { unread: 1 } });
      return respuesta(200, { data: [{}] });
    });
    vi.stubGlobal("fetch", f);
    const { suscribirContadoresForo } = await import("./foro-badge");
    const o = vi.fn();
    const baja = suscribirContadoresForo(o, false);
    await vi.waitFor(() => expect(o).toHaveBeenCalled());
    expect(o).toHaveBeenLastCalledWith({ unread: null, modCount: 1 });
    expect(urls(f)).toEqual(["/api/foro/badge", "/api/foro/moderation"]);
    baja();
  });
});
