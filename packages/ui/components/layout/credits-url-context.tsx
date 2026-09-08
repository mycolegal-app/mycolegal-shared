"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * #720 — Destino de recarga de créditos de IA, disponible para cualquier
 * pantalla que se tope con el saldo agotado.
 *
 * Lo sirve auth en `/api/auth/me` SOLO al org_admin (la sección de Cuenta en
 * Config exige ese rol), así que aquí su presencia ES el permiso: si hay URL, a
 * este usuario se le puede ofrecer el botón; si no la hay, lo único accionable
 * desde su sitio es avisar a quien administra la cuenta.
 *
 * Va por contexto y no por prop porque los sitios donde se choca con el saldo
 * están repartidos (el rail de MycoBot, el resumen de un documento en la Unidad
 * de Red, el revisor…) y encadenar la URL por props obligaría a tocar cada
 * pantalla intermedia. AppShell ya pide el `/me`: no cuesta una llamada más.
 */
const CreditsUrlContext = createContext<string | null>(null);

export function CreditsUrlProvider({
  url,
  children,
}: {
  url: string | null;
  children: ReactNode;
}) {
  return <CreditsUrlContext.Provider value={url}>{children}</CreditsUrlContext.Provider>;
}

/** `null` = este usuario no puede recargar (o aún no se ha resuelto el perfil). */
export function useCreditsUrl(): string | null {
  return useContext(CreditsUrlContext);
}
