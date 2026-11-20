import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, act, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../i18n/i18n-context", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

import { IdleTimeout } from "./idle-timeout";

// 20-nov-2026 (Carles, Chrome en iPhone): una pestaña en segundo plano tiene los
// temporizadores congelados y vuelve sin `visibilitychange`. Se simula moviendo el
// reloj del sistema SIN ejecutar temporizadores (eso es lo que hace iOS) y luego
// disparando el evento con el que vuelve la pestaña.
const MIN = 60_000;

function montar() {
  const onTimeout = vi.fn();
  const onLogout = vi.fn();
  const onSilentRefresh = vi.fn(() => Promise.resolve());
  render(
    <IdleTimeout
      timeoutMinutes={30}
      countdownSeconds={60}
      onContinue={() => Promise.resolve()}
      onLogout={onLogout}
      onTimeout={onTimeout}
      onSilentRefresh={onSilentRefresh}
    />,
  );
  return { onTimeout, onLogout, onSilentRefresh };
}

function congelarYAvanzar(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("IdleTimeout — pestaña congelada que vuelve", () => {
  it("restaurada (pageshow) horas después: cierra la sesión sin aviso", () => {
    const { onTimeout, onSilentRefresh } = montar();
    congelarYAvanzar(3 * 60 * MIN);
    act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onSilentRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText("ui.idleTimeout.btnContinue")).toBeNull();
  });

  it("el primer toque tras volver NO revive la sesión", () => {
    const { onTimeout, onSilentRefresh } = montar();
    congelarYAvanzar(45 * MIN);
    act(() => { fireEvent.touchStart(document); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onSilentRefresh).not.toHaveBeenCalled();
  });

  it("dentro de la cuenta atrás: enseña el aviso con los segundos que quedan", () => {
    const { onTimeout } = montar();
    congelarYAvanzar(30 * MIN + 20_000);
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(onTimeout).not.toHaveBeenCalled();
    expect(screen.getByText("ui.idleTimeout.btnContinue")).toBeTruthy();
    expect(screen.getAllByText("40").length).toBeGreaterThan(0);
  });

  it("el temporizador congelado que salta tarde no ofrece «Continuar»", () => {
    const { onTimeout } = montar();
    congelarYAvanzar(2 * 60 * MIN);
    act(() => { vi.advanceTimersByTime(30 * MIN); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("sin congelar: el aviso sale al plazo y cierra al acabar la cuenta atrás", () => {
    const { onTimeout } = montar();
    act(() => { vi.advanceTimersByTime(30 * MIN); });
    expect(screen.getByText("ui.idleTimeout.btnContinue")).toBeTruthy();
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("con actividad normal no cierra", () => {
    const { onTimeout } = montar();
    for (let i = 0; i < 6; i++) {
      act(() => { vi.advanceTimersByTime(20 * MIN); });
      act(() => { fireEvent.keyDown(document); });
    }
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
