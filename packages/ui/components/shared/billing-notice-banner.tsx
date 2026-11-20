"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../i18n/i18n-context";

/**
 * Aviso post-login de una app CONCEDIDA cuya cortesía/trial ha expirado: la org
 * conserva el acceso (OrgApp activo) pero ya no tiene derecho de pago. Descartable
 * (no bloquea la navegación); el corte real del consumo de IA lo hace el monedero
 * (suelo 0 para no-entitled). El CTA de reactivar solo se muestra al org_admin.
 */
export interface BillingNotice {
  appSlug: string;
  appName: string;
  /** APP_COURTESY_EXPIRED | APP_TRIAL_EXPIRED | APP_SUBSCRIPTION_EXPIRED | PAYMENT_METHOD_EXPIRING | CREDITS_LOW | CREDITS_EXHAUSTED */
  code: string;
  canSubscribe: boolean;
  /** ORG_EN_BAJA: fecha (ISO) en que se suprimirán los datos de la organización. */
  fecha?: string;
  /** ORG_EN_BAJA: destino del botón (Config → Organización, solo al org_admin). */
  ctaUrl?: string | null;
}

const CODE_KEY: Record<string, string> = {
  APP_COURTESY_EXPIRED: "courtesyExpired",
  APP_TRIAL_EXPIRED: "trialExpired",
  APP_SUBSCRIPTION_EXPIRED: "subscriptionExpired",
  PAYMENT_METHOD_EXPIRING: "paymentMethodExpiring",
  CREDITS_LOW: "creditsLow",
  CREDITS_EXHAUSTED: "creditsExhausted",
  ORG_EN_BAJA: "orgEnBaja",
};

/**
 * Baja con plazo (DPA §8): la organización está en baja hasta la supresión. Es el
 * aviso más serio: no se puede descartar y su botón (solo org_admin) lleva a anularla.
 */
const BAJA_CODES = new Set(["ORG_EN_BAJA"]);
const LOCALES: Record<string, string> = { CAST: "es-ES", CAT: "ca-ES", VAL: "ca-ES", GAL: "gl-ES", EUS: "eu-ES" };

/** Códigos org-level de tarjeta: CTA a actualizar tarjeta, no a suscribirse. */
const CARD_CODES = new Set(["PAYMENT_METHOD_EXPIRING"]);
/**
 * #720 — Saldo de créditos de IA. Org-level como el de tarjeta, pero su CTA
 * lleva a recargar. Se separa de CARD_CODES porque el destino es otro, y del
 * bloque de apps porque no habla de ninguna app concreta: cuando el saldo se
 * agota se paran las funciones de IA de TODAS.
 */
const CREDIT_CODES = new Set(["CREDITS_LOW", "CREDITS_EXHAUSTED"]);

export function BillingNoticeBanner({
  notices,
  subscribeUrl,
  paymentUrl,
  creditsUrl,
}: {
  notices: BillingNotice[];
  subscribeUrl?: string | null;
  paymentUrl?: string | null;
  /** Destino de recarga (#720). Solo llega al org_admin: sin él, no hay botón. */
  creditsUrl?: string | null;
}) {
  const { t, language } = useI18n();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = notices.filter((n) => !dismissed.has(`${n.appSlug}:${n.code}`));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-6 pt-3">
      {visible.map((n) => {
        const key = `${n.appSlug}:${n.code}`;
        const isCard = CARD_CODES.has(n.code);
        const isCredit = CREDIT_CODES.has(n.code);
        const isBaja = BAJA_CODES.has(n.code);
        const codeKey = CODE_KEY[n.code] ?? "subscriptionExpired";
        const ctaUrl = isBaja ? n.ctaUrl : isCard ? paymentUrl : isCredit ? creditsUrl : subscribeUrl;
        const fecha = n.fecha
          ? new Date(n.fecha).toLocaleDateString(LOCALES[language] ?? "es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" })
          : "";
        return (
          <div
            key={key}
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-mc-warning-500/30 bg-mc-warning-50 px-4 py-3"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-mc-warning-500" />
            <p className="flex-1 text-sm text-mc-warning-700">
              {t(`ui.billingNotice.${codeKey}`, { app: n.appName, fecha })}
              {!isCard && !isBaja && (
                <>
                  {" "}
                  {n.canSubscribe
                    ? t(isCredit ? "ui.billingNotice.rechargePrompt" : "ui.billingNotice.subscribePrompt")
                    : t("ui.billingNotice.askAdmin")}
                </>
              )}
            </p>
            {n.canSubscribe && ctaUrl && (
              <a
                href={ctaUrl}
                className="flex-shrink-0 rounded-lg bg-mc-warning-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                {t(
                  isBaja
                    ? "ui.billingNotice.ctaAnularBaja"
                    : isCard
                    ? "ui.billingNotice.ctaUpdateCard"
                    : isCredit
                      ? "ui.billingNotice.ctaRecharge"
                      : "ui.billingNotice.ctaSubscribe",
                )}
              </a>
            )}
            {!isBaja && (
            <button
              type="button"
              onClick={() => setDismissed((s) => new Set(s).add(key))}
              aria-label={t("ui.billingNotice.dismiss")}
              className="flex-shrink-0 rounded-sm p-1 text-mc-warning-700 transition-opacity hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
