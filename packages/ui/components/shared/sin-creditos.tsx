"use client";

import { useI18n } from "../i18n/i18n-context";
import { useCreditsUrl } from "../layout/credits-url-context";

/**
 * #720 — Qué se le enseña a alguien cuando la organización se queda sin
 * créditos de IA. Una sola pieza para toda la flota.
 *
 * POR QUÉ CENTRALIZARLO. El COBRO ya era único (todas las apps liquidan por
 * `sharedlib/server/credits` contra el monedero de la organización), pero la
 * REACCIÓN no: cada pantalla se lo inventaba, y la mayoría se limitaba a soltar
 * el mensaje del servidor. El resultado era un callejón sin salida —"compra un
 * pack" sin decir dónde— que en producción se tradujo en que prácticamente
 * ninguna notaría recargara nunca.
 *
 * Y hay una regla que no puede quedar al criterio de cada pantalla: comprar es
 * cosa del org_admin. `useCreditsUrl()` devuelve la URL de recarga SOLO si auth
 * se la ha servido a este usuario, así que su presencia es el permiso. A quien
 * no puede comprar no se le enseña un botón que acabaría en un 403: se le dice
 * a quién avisar, que es lo único accionable desde su sitio.
 */
export function SinCreditos({ message, className }: { message?: string | null; className?: string }) {
  const { t } = useI18n();
  const creditsUrl = useCreditsUrl();
  return (
    <div className={className}>
      <p>{message || t("ui.sinCreditos.mensaje")}</p>
      {creditsUrl ? (
        <a
          href={creditsUrl}
          className="mt-2 inline-flex items-center rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
        >
          {t("ui.sinCreditos.recargar")}
        </a>
      ) : (
        <p className="mt-1.5 text-xs opacity-80">{t("ui.sinCreditos.avisaAdmin")}</p>
      )}
    </div>
  );
}

/**
 * ¿Este código de error significa "sin créditos"? Reconoce los DOS nombres que
 * conviven en la flota: `INSUFFICIENT_CREDITS` (el ask de Consultor) y
 * `NO_CREDITS` (revisor, resumen de la Unidad, sugerencias de Tramitación, el
 * asistente de Web). Unificar el nombre exigiría desplegar a la vez todas las
 * apps que lo emiten y todas las que lo leen; reconocer ambos aquí cuesta una
 * línea y deja la migración para cuando toque, sin dejar a nadie a medias.
 */
export function esErrorDeCreditos(code?: string | null): boolean {
  return code === "INSUFFICIENT_CREDITS" || code === "NO_CREDITS";
}
