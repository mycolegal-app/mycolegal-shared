import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("pedirConCacheDeSesion", () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const respuesta = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });

  it("varios a la vez: una sola petición; la siguiente carga sale de sessionStorage", async () => {
    const f = vi.fn(async () => respuesta(200, { v: 1 }));
    vi.stubGlobal("fetch", f);
    const { pedirConCacheDeSesion } = await import("./cache-sesion");
    const r = await Promise.all([1, 2, 3].map(() => pedirConCacheDeSesion("/api/version", { vidaMs: 60_000 })));
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.every((x) => x.json.v === 1)).toBe(true);
    vi.resetModules(); // nueva carga de página: la memoria del módulo se pierde, sessionStorage no
    const { pedirConCacheDeSesion: otra } = await import("./cache-sesion");
    expect((await otra("/api/version", { vidaMs: 60_000 })).json.v).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("caduca, y forzar ignora lo guardado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const f = vi.fn(async () => respuesta(200, {}));
    vi.stubGlobal("fetch", f);
    const { pedirConCacheDeSesion } = await import("./cache-sesion");
    await pedirConCacheDeSesion("/x", { vidaMs: 60_000 });
    await pedirConCacheDeSesion("/x", { vidaMs: 60_000, forzar: true });
    expect(f).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 61_000);
    await pedirConCacheDeSesion("/x", { vidaMs: 60_000 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("no guarda errores salvo los estables, ni lo que guardarSi rechaza; fallo de red = status 0", async () => {
    const { pedirConCacheDeSesion } = await import("./cache-sesion");
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(503, null)));
    await pedirConCacheDeSesion("/a", { vidaMs: 60_000 });
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(501, null)));
    await pedirConCacheDeSesion("/b", { vidaMs: 60_000, estadosEstables: [501] });
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(200, { pending: [{ id: "x" }] })));
    await pedirConCacheDeSesion("/c", { vidaMs: 60_000, guardarSi: (j: any) => j.pending.length === 0 });
    expect(window.sessionStorage.getItem("mc:cs:v1:/a")).toBeNull();
    expect(window.sessionStorage.getItem("mc:cs:v1:/b")).not.toBeNull();
    expect(window.sessionStorage.getItem("mc:cs:v1:/c")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red"); }));
    expect(await pedirConCacheDeSesion("/d", { vidaMs: 60_000 })).toEqual({ status: 0, ok: false, json: null });
  });

  it("olvidarCacheDeSesion borra solo lo suyo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(200, {})));
    const { pedirConCacheDeSesion, olvidarCacheDeSesion } = await import("./cache-sesion");
    window.sessionStorage.setItem("mc:me:v1", "perfil");
    await pedirConCacheDeSesion("/a", { vidaMs: 60_000 });
    await pedirConCacheDeSesion("/b", { vidaMs: 60_000 });
    olvidarCacheDeSesion();
    expect(window.sessionStorage.getItem("mc:cs:v1:/a")).toBeNull();
    expect(window.sessionStorage.getItem("mc:cs:v1:/b")).toBeNull();
    expect(window.sessionStorage.getItem("mc:me:v1")).toBe("perfil");
  });
});
