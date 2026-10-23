import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { LoginForm } from "./login-form";

// Sin I18nProvider, `t` devuelve la clave: los textos se buscan por clave.

type Call = { url: string; body: Record<string, unknown> };

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const queue = [...responses];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    const next = queue.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

function login(email = "ana@notaria.es", password = "ClaveActual2026") {
  render(<LoginForm appName="App" onSuccess={onSuccess} />);
  fireEvent.change(document.getElementById("email")!, { target: { value: email } });
  fireEvent.change(document.getElementById("password")!, { target: { value: password } });
  fireEvent.click(screen.getByText("ui.login.btnLogin"));
}

const onSuccess = vi.fn();

afterEach(() => {
  cleanup();
  onSuccess.mockReset();
});

const USER = { id: "u1", email: "ana@notaria.es", role: "user" };

describe("aviso «tu contraseña caduca en N días»", () => {
  it("sin passwordExpiresInDays entra directamente", async () => {
    mockFetch([{ status: 200, body: { data: { user: USER, passwordExpiresInDays: null } } }]);
    login();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("password-expiring-notice")).toBeNull();
  });

  it("con días muestra el aviso y «Más tarde» sigue al destino", async () => {
    mockFetch([{ status: 200, body: { data: { user: USER, passwordExpiresInDays: 5 } } }]);
    login();
    await screen.findByTestId("password-expiring-notice");
    expect(onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("ui.login.expiringLater"));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("el cambio forzado (mustChangePassword) tiene prioridad sobre el aviso", async () => {
    mockFetch([{ status: 200, body: { data: { user: USER, mustChangePassword: true, passwordExpiresInDays: 3 } } }]);
    login();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("password-expiring-notice")).toBeNull();
  });

  it("«Cambiarla ahora» usa el cambio CON sesión (actual pre-rellenada) y vuelve a entrar con la nueva", async () => {
    const calls = mockFetch([
      { status: 200, body: { data: { user: USER, passwordExpiresInDays: 2 } } },
      { status: 200, body: { success: true } },
      { status: 200, body: { data: { user: USER, passwordExpiresInDays: null } } },
    ]);
    login();
    await screen.findByTestId("password-expiring-notice");
    fireEvent.click(screen.getByText("ui.login.expiringChangeNow"));
    expect((document.getElementById("expired-current") as HTMLInputElement).value).toBe("ClaveActual2026");
    fireEvent.change(document.getElementById("expired-new")!, { target: { value: "ClaveNueva20261" } });
    fireEvent.change(document.getElementById("expired-confirm")!, { target: { value: "ClaveNueva20261" } });
    fireEvent.click(screen.getByText("ui.login.changeSubmit"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/login", "/api/auth/change-password", "/api/auth/login"]);
    expect(calls[1].body).toEqual({ currentPassword: "ClaveActual2026", newPassword: "ClaveNueva20261" });
    expect(calls[2].body).toMatchObject({ email: "ana@notaria.es", password: "ClaveNueva20261" });
  });

  it("errores del cambio con sesión traducidos por código (cuerpo de auth sin normalizar)", async () => {
    mockFetch([
      { status: 200, body: { data: { user: USER, passwordExpiresInDays: 2 } } },
      { status: 409, body: { error: "La contraseña actual no es correcta", code: "CURRENT_PASSWORD_INVALID" } },
    ]);
    login();
    await screen.findByTestId("password-expiring-notice");
    fireEvent.click(screen.getByText("ui.login.expiringChangeNow"));
    fireEvent.change(document.getElementById("expired-new")!, { target: { value: "ClaveNueva20261" } });
    fireEvent.change(document.getElementById("expired-confirm")!, { target: { value: "ClaveNueva20261" } });
    fireEvent.click(screen.getByText("ui.login.changeSubmit"));
    await screen.findByText("ui.login.errCurrentPassword");
  });
});

describe("contraseña caducada (sin sesión)", () => {
  it("PASSWORD_EXPIRED abre el diálogo y WEAK_PASSWORD se traduce", async () => {
    const calls = mockFetch([
      { status: 403, body: { error: { code: "PASSWORD_EXPIRED", message: "x" } } },
      { status: 400, body: { error: { code: "WEAK_PASSWORD", message: "Validation error" } } },
    ]);
    login();
    await screen.findByText("ui.login.expiredTitle");
    fireEvent.change(document.getElementById("expired-new")!, { target: { value: "ClaveNueva20261" } });
    fireEvent.change(document.getElementById("expired-confirm")!, { target: { value: "ClaveNueva20261" } });
    fireEvent.click(screen.getByText("ui.login.expiredSubmit"));
    await screen.findByText("ui.login.errWeakPassword");
    expect(calls[1].url).toBe("/api/auth/password/expired");
    expect(calls[1].body).toEqual({ email: "ana@notaria.es", currentPassword: "ClaveActual2026", newPassword: "ClaveNueva20261" });
  });
});
