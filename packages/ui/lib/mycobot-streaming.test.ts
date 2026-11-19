import { describe, expect, it } from "vitest";
import { dominioCookieCompartida } from "./mycobot-streaming";

describe("dominioCookieCompartida (#55)", () => {
  it("comparte la cookie entre las apps de cada entorno", () => {
    expect(dominioCookieCompartida("consultor.mycolegal.app")).toBe(".mycolegal.app");
    expect(dominioCookieCompartida("redactor.test.mycolegal.app")).toBe(".test.mycolegal.app");
  });
  it("en localhost o una IP la cookie es del host", () => {
    expect(dominioCookieCompartida("localhost")).toBeNull();
    expect(dominioCookieCompartida("127.0.0.1")).toBeNull();
  });
  it("un dominio de dos partes se usa tal cual", () => {
    expect(dominioCookieCompartida("mycolegal.app")).toBe(".mycolegal.app");
  });
});
