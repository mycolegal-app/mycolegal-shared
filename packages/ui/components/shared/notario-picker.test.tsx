import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { NotarioPicker } from "./notario-picker";
import { IncidentReporter } from "./incident-reporter";
import {
  claveAlta,
  debeMostrarAvisoAlta,
  textoAltaNotario,
  type DatosAltaNotario,
} from "./notario-picker-logic";
import { enviarReporteDirecto, SinReporterError } from "../../lib/incident-quick-report";

// Sin I18nProvider, `t` devuelve la clave: los textos se buscan por clave.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("#1011 — lógica del aviso de alta en el directorio", () => {
  const base = { escritoAMano: true, texto: "Pérez Gómez", cargando: false, hayCandidatosVisibles: false, descartado: false };

  it("avisa con un nombre escrito a mano", () => {
    expect(debeMostrarAvisoAlta(base)).toBe(true);
  });

  it("no avisa si el valor no lo tecleó el usuario (ficha cargada) o lo eligió del catálogo", () => {
    expect(debeMostrarAvisoAlta({ ...base, escritoAMano: false })).toBe(false);
  });

  it("no avisa mientras busca, con candidatos a la vista, descartado o con texto corto", () => {
    expect(debeMostrarAvisoAlta({ ...base, cargando: true })).toBe(false);
    expect(debeMostrarAvisoAlta({ ...base, hayCandidatosVisibles: true })).toBe(false);
    expect(debeMostrarAvisoAlta({ ...base, descartado: true })).toBe(false);
    expect(debeMostrarAvisoAlta({ ...base, texto: " ab " })).toBe(false);
  });

  it("texto para soporte: nombre, población y provincia, sin vacíos ni repetidos", () => {
    expect(textoAltaNotario({ nombre: "  Ana  Pérez ", poblacion: "Getafe", provincia: "Madrid" })).toBe(
      "Alta de notario en el directorio: Ana Pérez, Getafe, Madrid",
    );
    expect(textoAltaNotario({ nombre: "Ana Pérez", poblacion: "Madrid", provincia: "madrid" })).toBe(
      "Alta de notario en el directorio: Ana Pérez, Madrid",
    );
    expect(textoAltaNotario({ nombre: "Ana Pérez", poblacion: null, provincia: "" })).toBe(
      "Alta de notario en el directorio: Ana Pérez",
    );
  });

  it("la clave de envío ignora mayúsculas y espacios", () => {
    expect(claveAlta("  Ana   PÉREZ ")).toBe(claveAlta("ana pérez"));
  });
});

describe("#1011 — reporte directo vía IncidentReporter", () => {
  it("sin reporter montado rechaza con SinReporterError", async () => {
    await expect(enviarReporteDirecto({ kind: "improvement", description: "x" })).rejects.toBeInstanceOf(SinReporterError);
  });

  it("el reporter montado lo envía a su submitUrl con su appSlug, como propuesta", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<IncidentReporter appSlug="peticiones" />);
    await act(async () => {
      await enviarReporteDirecto({
        kind: "improvement",
        description: "Alta de notario en el directorio: Ana Pérez",
        extra: { tipo: "alta_notario_directorio" },
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/incidents");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      appSlug: "peticiones",
      kind: "improvement",
      description: "Alta de notario en el directorio: Ana Pérez",
      metadata: { context: { tipo: "alta_notario_directorio" } },
    });
  });

  it("si auth responde error, la promesa rechaza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    render(<IncidentReporter appSlug="peticiones" />);
    await expect(enviarReporteDirecto({ kind: "improvement", description: "x" })).rejects.toBeInstanceOf(Error);
  });
});

describe("#1011 — NotarioPicker: notario escrito a mano", () => {
  function Harness(props: { onSolicitarAlta?: (d: DatosAltaNotario) => Promise<void>; inicial?: string }) {
    const [v, setV] = useState(props.inicial ?? "");
    return (
      <NotarioPicker
        value={v}
        onChange={(text) => setV(text)}
        onSolicitarAlta={props.onSolicitarAlta}
        datosAlta={{ poblacion: "Getafe", provincia: "Madrid" }}
      />
    );
  }
  const sinResultados = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }))));

  it("un valor ya guardado no muestra el aviso", () => {
    sinResultados();
    render(<Harness inicial="Notario Guardado" />);
    expect(screen.queryByText("ui.notarioPicker.altaBoton")).toBeNull();
  });

  it("al escribir uno que no está, avisa sin bloquear y pide el alta con un clic", async () => {
    sinResultados();
    const solicitar = vi.fn(async () => {});
    render(<Harness onSolicitarAlta={solicitar} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ana Pérez" } });
    const boton = await screen.findByText("ui.notarioPicker.altaBoton", {}, { timeout: 2000 });
    // No bloquea: el texto sigue en el campo tal cual.
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Ana Pérez");
    fireEvent.click(boton);
    await screen.findByText("ui.notarioPicker.altaEnviada");
    expect(solicitar).toHaveBeenCalledWith({ nombre: "Ana Pérez", poblacion: "Getafe", provincia: "Madrid" });
  });

  it("si el envío falla lo dice y deja reintentar", async () => {
    sinResultados();
    render(<Harness onSolicitarAlta={async () => { throw new Error("x"); }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ana Pérez" } });
    fireEvent.click(await screen.findByText("ui.notarioPicker.altaBoton", {}, { timeout: 2000 }));
    await screen.findByText("ui.notarioPicker.altaError");
    expect(screen.getByText("ui.notarioPicker.altaBoton")).toBeTruthy();
  });

  it("el aviso se puede descartar", async () => {
    sinResultados();
    render(<Harness onSolicitarAlta={async () => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ana Pérez" } });
    await screen.findByText("ui.notarioPicker.altaBoton", {}, { timeout: 2000 });
    fireEvent.click(screen.getByLabelText("ui.notarioPicker.altaDescartar"));
    await waitFor(() => expect(screen.queryByText("ui.notarioPicker.altaAviso")).toBeNull());
  });

  it("al elegir del catálogo desaparece el aviso", async () => {
    const notario = { id: "n1", nombre: "Ana Pérez Gómez", nombreCompleto: null, provincia: { id: "p", codigo: null, nombre: "Madrid" }, poblacion: { id: "x", nombre: "Getafe" }, fuente: "AMBOS" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [notario] }))));
    render(<Harness onSolicitarAlta={async () => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Getafe" } });
    // Con candidatos a la vista no se avisa; se muestran con población y provincia.
    await screen.findByText("Getafe, Madrid", {}, { timeout: 2000 });
    expect(screen.queryByText("ui.notarioPicker.altaBoton")).toBeNull();
    fireEvent.click(screen.getByText("Ana Pérez Gómez"));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Ana Pérez Gómez");
    expect(screen.queryByText("ui.notarioPicker.altaBoton")).toBeNull();
  });
});
