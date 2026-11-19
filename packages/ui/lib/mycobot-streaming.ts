/**
 * Preferencia «ver la respuesta de MycoBot mientras se escribe» (#55, Lara).
 *
 * Se cambia con los comandos `/streaming off` y `/streaming on` de la barra de MycoBot y se
 * guarda en el NAVEGADOR, no en la cuenta. Va en una cookie del dominio padre
 * (`.mycolegal.app`, `.test.mycolegal.app`…) y no en localStorage porque cada app es un
 * subdominio con su propio localStorage: con éste, apagarlo en Consultor no lo apagaría en
 * Redactor. En localhost (sin dominio padre) la cookie es del host, que comparten todos los
 * puertos de la flota local.
 *
 * Por defecto (sin cookie) el streaming está ACTIVADO: es el comportamiento de siempre.
 * En `off` la barra sigue enseñando los pasos, pero no las notas ni el borrador: la
 * respuesta aparece entera al terminar.
 */

const COOKIE = "mycobot_streaming";
const UN_ANIO = 60 * 60 * 24 * 365;

/** Dominio padre para compartir la cookie entre las apps (`consultor.test.mycolegal.app` → `.test.mycolegal.app`). */
export function dominioCookieCompartida(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (h === "localhost" || /^[\d.]+$/.test(h) || !h.includes(".")) return null;
  const partes = h.split(".");
  if (partes.length <= 2) return `.${h}`;
  return `.${partes.slice(1).join(".")}`;
}

export function leerStreamingMycobot(): boolean {
  if (typeof document === "undefined") return true;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`));
  return m?.[1] !== "off";
}

export function guardarStreamingMycobot(activo: boolean): void {
  if (typeof document === "undefined") return;
  const dom = dominioCookieCompartida(window.location.hostname);
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE}=${activo ? "on" : "off"}; Path=/; Max-Age=${UN_ANIO}; SameSite=Lax` +
    (dom ? `; Domain=${dom}` : "") +
    seguro;
}
