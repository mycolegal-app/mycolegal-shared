import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  NotificationsBell,
  notificationFitsInList,
  resolveNotificationTarget,
  type NotificationEntry,
} from "./notifications-bell";

// #987 — El aviso tiene que llevar a su destino (antes sólo había «Cerrar»).
// Sin I18nProvider, `t` devuelve la clave: los textos se buscan por clave.

const ORIGIN = "https://gestoria.mycolegal.app";

function entry(over: Partial<NotificationEntry> = {}): NotificationEntry {
  return {
    id: "n1",
    type: "mensaje",
    title: "Nuevo mensaje de la gestoría",
    body: null,
    link: "/expedientes/42/mensajes",
    appSlug: "gestoria",
    relatedType: null,
    relatedId: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    absoluteLink: `${ORIGIN}/expedientes/42/mensajes`,
    ...over,
  };
}

describe("resolveNotificationTarget (#987)", () => {
  it("misma app con ruta → navegación interna", () => {
    expect(resolveNotificationTarget(entry(), "gestoria", ORIGIN)).toEqual({
      kind: "internal",
      path: "/expedientes/42/mensajes",
    });
  });

  it("misma app con «/» o sin enlace → sin destino", () => {
    expect(resolveNotificationTarget(entry({ link: "/" }), "gestoria", ORIGIN)).toBeNull();
    expect(resolveNotificationTarget(entry({ link: "" }), "gestoria", ORIGIN)).toBeNull();
  });

  it("otra app → URL absoluta", () => {
    expect(resolveNotificationTarget(entry(), "notaria", "https://notaria.mycolegal.app")).toEqual({
      kind: "external",
      url: `${ORIGIN}/expedientes/42/mensajes`,
    });
  });

  it("otra app sin app_url conocido (absoluteLink relativo) → sin destino", () => {
    const n = entry({ absoluteLink: "/expedientes/42/mensajes" });
    expect(resolveNotificationTarget(n, "notaria", "https://notaria.mycolegal.app")).toBeNull();
  });

  it("URL absoluta del mismo origen → navegación interna", () => {
    const n = entry({ link: `${ORIGIN}/expedientes/42?tab=mensajes#ultimo` });
    expect(resolveNotificationTarget(n, "gestoria", ORIGIN)).toEqual({
      kind: "internal",
      path: "/expedientes/42?tab=mensajes#ultimo",
    });
  });
});

describe("notificationFitsInList (#987)", () => {
  it("sin cuerpo o cuerpo corto cabe; largo o con saltos de línea, no", () => {
    expect(notificationFitsInList({ body: null })).toBe(true);
    expect(notificationFitsInList({ body: "Expediente 42" })).toBe(true);
    expect(notificationFitsInList({ body: "x".repeat(200) })).toBe(false);
    expect(notificationFitsInList({ body: "línea 1\nlínea 2" })).toBe(false);
  });
});

function mockFetch(items: NotificationEntry[]) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const body = u.includes("unread-count")
      ? { unread: items.length }
      : u.includes("/read")
        ? {}
        : { data: items, total: items.length, unread: items.length, limit: 20, offset: 0 };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

async function openBellAndClick(title: string) {
  fireEvent.click(screen.getAllByLabelText("ui.notifications.title")[0]);
  fireEvent.click(await screen.findByText(title));
}

afterEach(() => cleanup());

describe("NotificationsBell (#987)", () => {
  it("cuerpo largo: abre la ventana y «Abrir» navega con el router del host", async () => {
    mockFetch([entry({ body: "Texto largo del mensaje. ".repeat(10) })]);
    const nav = vi.fn();
    render(<NotificationsBell currentAppSlug="gestoria" onNavigateInternal={nav} />);
    await openBellAndClick("Nuevo mensaje de la gestoría");

    expect(screen.getByRole("dialog", { name: "ui.notifications.detailAria" })).toBeTruthy();
    expect(screen.getByText("ui.common.close", { selector: "button" })).toBeTruthy();
    fireEvent.click(screen.getByText("ui.notifications.open"));
    expect(nav).toHaveBeenCalledWith("/expedientes/42/mensajes");
    expect(screen.queryByRole("dialog", { name: "ui.notifications.detailAria" })).toBeNull();
  });

  it("cuerpo que cabe en la lista: pulsar el aviso navega directo, sin ventana", async () => {
    mockFetch([entry({ body: "Expediente 42" })]);
    const nav = vi.fn();
    render(<NotificationsBell currentAppSlug="gestoria" onNavigateInternal={nav} />);
    await openBellAndClick("Nuevo mensaje de la gestoría");

    expect(nav).toHaveBeenCalledWith("/expedientes/42/mensajes");
    expect(screen.queryByRole("dialog", { name: "ui.notifications.detailAria" })).toBeNull();
  });

  it("aviso sin destino: ventana sólo con «Cerrar»", async () => {
    mockFetch([entry({ link: "/", body: "Aviso del sistema" })]);
    const nav = vi.fn();
    render(<NotificationsBell currentAppSlug="gestoria" onNavigateInternal={nav} />);
    await openBellAndClick("Nuevo mensaje de la gestoría");

    expect(screen.getByRole("dialog", { name: "ui.notifications.detailAria" })).toBeTruthy();
    expect(screen.queryByText("ui.notifications.open")).toBeNull();
    expect(nav).not.toHaveBeenCalled();
  });
});
