"use client";

// Una app que la notaría NO tiene contratada, pulsada desde otra (el botón de Redactor en
// LegiFirma/Pólizas/Notaría, la «Entrada de Tramitación»…). Regla de Carles (27-nov-2026,
// Lanzamiento 1.4/10.2): el botón se queda VISIBLE y, al pulsarlo, nunca un error: si la app se
// vende, la ficha con «Contratar» (Config → Suscripciones); si no, «Avisadme» (registro de interés).
// Es la misma ficha que «Más apps» de la barra superior (SubscribeAppModal), con los datos de venta
// que la app ya sirve en /api/auth/me (`sellableExtras`, `subscribeUrl`, `canSubscribe`).
import { useEffect, useState } from "react";
import { SubscribeAppModal, type SubscribableApp } from "./subscribe-app-modal";

interface MeVenta {
  sellableExtras?: SubscribableApp[];
  subscribeUrl?: string | null;
  canSubscribe?: boolean;
}

export interface AppNoContratadaProps {
  /** Slug de la app no contratada (p. ej. "redactor"). */
  slug: string;
  /** Nombre a mostrar si la app no viene en `sellableExtras` (p. ej. no está a la venta). */
  nombre?: string;
  onClose: () => void;
}

export function AppNoContratada({ slug, nombre, onClose }: AppNoContratadaProps) {
  const [venta, setVenta] = useState<{ app: SubscribableApp; subscribeUrl: string | null; canSubscribe: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: MeVenta } | null) => {
        if (!vivo) return;
        const d = j?.data ?? {};
        const app = d.sellableExtras?.find((a) => a.slug === slug) ?? {
          // Sin datos de venta: se ofrece «Avisadme» (interés), nunca un error.
          slug, name: nombre ?? slug, appUrl: "", sellable: false,
        };
        setVenta({ app, subscribeUrl: d.subscribeUrl ?? null, canSubscribe: d.canSubscribe === true });
      })
      .catch(() => {
        if (vivo) setVenta({ app: { slug, name: nombre ?? slug, appUrl: "", sellable: false }, subscribeUrl: null, canSubscribe: false });
      });
    return () => { vivo = false; };
  }, [slug, nombre]);

  if (!venta) return null;
  return <SubscribeAppModal app={venta.app} onClose={onClose} subscribeUrl={venta.subscribeUrl} canSubscribe={venta.canSubscribe} />;
}
