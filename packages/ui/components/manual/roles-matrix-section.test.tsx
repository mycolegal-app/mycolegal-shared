import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { RolesMatrixSection } from "./roles-matrix-section";

// #1045 — la sección del manual se genera de los datos; sin sesión, avisa.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

describe("RolesMatrixSection", () => {
  it("sin sesión pinta el aviso y no rompe", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(401)));
    render(<RolesMatrixSection lang="CAST" />);
    expect(await screen.findByText(/Inicia sesión en la aplicación/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Roles y permisos de MycoLegal" })).toBeTruthy();
  });

  it("pinta la tabla de la app actual con los permisos legibles y los reservados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond(200, {
          data: {
            scope: "org",
            roleCatalog: [{ codigo: "USUARIO_NOTARIA", label: "Usuario de notaría", descripcion: "Trabaja en la notaría" }],
            apps: [
              {
                slug: "consultor",
                name: "Consultor",
                roles: [
                  { key: "ADMINISTRADOR_NOTARIA", label: "Administrador de notaría", permissions: ["*"] },
                  { key: "USUARIO_NOTARIA", label: "Usuario de notaría", permissions: ["consultas:read"] },
                ],
                permissions: [
                  { key: "consultas:read", label: "Ver consultas", group: "Consultas" },
                  { key: "resoluciones:review", label: "Revisar resoluciones", group: "Corpus", reserved: true },
                ],
              },
            ],
          },
        }),
      ),
    );
    render(<RolesMatrixSection lang="CAST" appSlug="consultor" />);
    expect(await screen.findByText("Ver consultas")).toBeTruthy();
    expect(screen.getByText("Revisar resoluciones")).toBeTruthy();
    expect(screen.getAllByText("Reservado").length).toBeGreaterThan(0);
    expect(screen.getByText("Trabaja en la notaría")).toBeTruthy();
  });

  it("si la ruta del manual no existe, usa el catálogo del panel", async () => {
    const fetchMock = vi.fn((url: string) =>
      url.startsWith("/api/manual")
        ? respond(404)
        : respond(200, {
            data: { apps: [{ slug: "x", name: "X", roles: [{ key: "USUARIO_NOTARIA", label: "Usuario de notaría", permissions: ["libro:read"] }] }] },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RolesMatrixSection lang="CAST" />);
    await waitFor(() => expect(screen.getByText("libro:read")).toBeTruthy());
    expect(screen.getByText(/Vista reducida/)).toBeTruthy();
  });
});
