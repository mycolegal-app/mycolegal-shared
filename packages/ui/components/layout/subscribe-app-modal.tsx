"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, X } from "lucide-react";
import type { AppInfo } from "./app-info";
import { useI18n } from "../i18n/i18n-context";

/**
 * App no concedida, tal como la sirve auth en `sellableExtras` de /api/auth/me:
 * el AppInfo de siempre + el copy de venta, el precio de su plan y el enlace a
 * su micrositio en la landing.
 */
export interface SubscribableApp extends AppInfo {
  /** Copy de venta del plan (el mismo que ve en el selector del registro). */
  description?: string | null;
  /** true → se puede contratar ya; false → "Próximamente" (solo registrar interés). */
  sellable?: boolean;
  priceCents?: number | null;
  currency?: string;
  /** Micrositio de la app en la landing (`/apps/<slug>`): «Más información». */
  infoUrl?: string | null;
}

interface SubscribeAppModalProps {
  app: SubscribableApp;
  onClose: () => void;
  /** Destino de contratación (Config → /cuenta/suscripciones); se abre con `?app=<slug>`. */
  subscribeUrl?: string | null;
  /** true = org_admin: puede contratar. Los demás ven el aviso de pedírselo. */
  canSubscribe?: boolean;
}

function money(cents: number, currency = "eur") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Ficha de una app de «Más apps» (toolbar). NO contrata nada: el único camino de
 * contratación es Config → Suscripciones (`subscribeUrl?app=<slug>`), que
 * resalta la tarjeta, muestra precio/IVA/tarjeta y admite un código promocional.
 * Así no hay dos implementaciones de la contratación que puedan divergir
 * (PLAN_TECNICO_CUPONES.md §10). Lo único que sigue haciéndose aquí es registrar
 * interés en una app «Próximamente», que no es una contratación.
 */
export function SubscribeAppModal({ app, onClose, subscribeUrl, canSubscribe = false }: SubscribeAppModalProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interested, setInterested] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sellable = app.sellable !== false;
  const contractHref = subscribeUrl ? `${subscribeUrl}?app=${encodeURIComponent(app.slug)}` : null;

  async function registerInterest() {
    setBusy(true);
    setError(null);
    try {
      // Proxy de billing de la app (factory createBillingRoutes): reenvía a
      // platform forzando el orgId de la sesión.
      const res = await fetch("/api/billing/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: app.slug }),
      });
      if (!res.ok) {
        setError(t("ui.subscribeApp.errorGeneric"));
        return;
      }
      setInterested(true);
    } catch {
      setError(t("ui.subscribeApp.errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const btnBase = "rounded-lg px-4 py-2.5 text-sm font-medium transition";
  const btnGhost = `${btnBase} border border-slate-300 text-slate-700 hover:bg-slate-50`;
  const btnPrimary = `${btnBase} flex flex-1 items-center justify-center gap-2 bg-cyan font-semibold text-white hover:bg-cyan-600 disabled:opacity-60`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-app-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("ui.subscribeApp.close")}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          {app.logoSvg && (
            <span
              className="mt-0.5 h-10 w-10 shrink-0 [&>svg]:h-full [&>svg]:w-full"
              // El logo lo sirve nuestro propio backend desde el catálogo de apps.
              dangerouslySetInnerHTML={{ __html: app.logoSvg }}
            />
          )}
          <div className="min-w-0">
            <h2 id="subscribe-app-title" className="text-lg font-bold text-slate-900">
              {app.name}
            </h2>
            {!sellable && (
              <span className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {t("ui.subscribeApp.comingSoon")}
              </span>
            )}
          </div>
        </div>

        {(app.description || app.infoUrl) && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {app.description}
            {app.infoUrl && (
              <>
                {" "}
                <a
                  href={app.infoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 whitespace-nowrap text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
                >
                  {t("ui.subscribeApp.moreInfo")}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </>
            )}
          </p>
        )}

        {sellable && typeof app.priceCents === "number" && (
          <div className="mt-4 flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="text-sm text-slate-600">{t("ui.subscribeApp.price")}</span>
            <span className="text-right">
              <span className="block text-lg font-bold text-slate-900">
                {money(app.priceCents, app.currency)}
              </span>
              <span className="text-xs text-slate-500">{t("ui.subscribeApp.perMonth")}</span>
            </span>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Acción según caso: contratar (org_admin, vendible) → Config; usuario sin
            permiso → solo aviso; «Próximamente» → registrar interés. */}
        {sellable && canSubscribe && contractHref ? (
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onClose} className={btnGhost}>
              {t("ui.subscribeApp.cancel")}
            </button>
            <a href={contractHref} className={btnPrimary}>
              {t("ui.subscribeApp.contract")}
            </a>
          </div>
        ) : sellable ? (
          <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            {t("ui.subscribeApp.askAdmin")}
          </p>
        ) : interested ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            {t("ui.subscribeApp.interestRegistered", { app: app.name })}
          </div>
        ) : (
          <>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={onClose} className={btnGhost}>
                {t("ui.subscribeApp.cancel")}
              </button>
              <button type="button" disabled={busy} onClick={registerInterest} className={btnPrimary}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("ui.subscribeApp.notifyMe")}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">{t("ui.subscribeApp.notifyHint")}</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
