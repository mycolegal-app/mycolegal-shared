import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("pedirAuthMe", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const respuesta = (ok: boolean, json: unknown) => ({ ok, status: ok ? 200 : 503, json: async () => json });

  it("cuatro componentes a la vez: una sola petición", async () => {
    const f = vi.fn(async () => respuesta(true, { data: { email: "a@b" } }));
    vi.stubGlobal("fetch", f);
    const { pedirAuthMe } = await import("./auth-me");
    const r = await Promise.all([pedirAuthMe(), pedirAuthMe(), pedirAuthMe(), pedirAuthMe()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.every((x) => x.data.email === "a@b")).toBe(true);
  });

  it("lo que se monta poco después recibe la misma respuesta; pasados unos segundos se vuelve a pedir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const f = vi.fn(async () => respuesta(true, { data: {} }));
    vi.stubGlobal("fetch", f);
    const { pedirAuthMe } = await import("./auth-me");
    await pedirAuthMe();
    vi.setSystemTime(Date.now() + 2_000);
    await pedirAuthMe();
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 10_000);
    await pedirAuthMe();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("un error no se guarda: quien reintenta pide de verdad", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(respuesta(false, null))
      .mockResolvedValueOnce(respuesta(true, { data: { ok: 1 } }));
    vi.stubGlobal("fetch", f);
    const { pedirAuthMe } = await import("./auth-me");
    await expect(pedirAuthMe()).rejects.toThrow("me 503");
    expect((await pedirAuthMe()).data.ok).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("olvidarAuthMe obliga a pedir de nuevo", async () => {
    const f = vi.fn(async () => respuesta(true, { data: {} }));
    vi.stubGlobal("fetch", f);
    const { pedirAuthMe, olvidarAuthMe } = await import("./auth-me");
    await pedirAuthMe();
    olvidarAuthMe();
    await pedirAuthMe();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
