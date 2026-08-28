/**
 * Resolución FIABLE de la IP del cliente para las rutas de app que reenvían a auth.
 *
 * El problema: auth aplica rate-limit y, si no le llega la IP del cliente, ve
 * como origen la IP del propio servicio Next. Todas las apps salen por las
 * mismas IPs de Cloud Run, así que el cupo "por IP" se convertía en un cupo
 * GLOBAL para toda la plataforma — bastaba con que unos pocos usuarios lo
 * consumieran para que el resto recibiera 429.
 *
 * Por qué NO se reenvía el `x-forwarded-for` tal cual: el cliente puede mandar
 * su propia cabecera y la infraestructura de Google la CONSERVA y añade la IP
 * real al final. O sea, las entradas de la izquierda las escribe el atacante:
 * reenviarlas sin más dejaría el rate-limit de auth eludible rotando la
 * cabecera. Solo es de fiar lo que añade la infraestructura por la derecha.
 *
 * Cuántas entradas añade la infraestructura: en esta plataforma las apps se
 * publican con *domain mappings* de Cloud Run (no hay balanceador global — no
 * existen url-maps ni backend-services en el proyecto), así que el GFE añade
 * exactamente UNA entrada: la IP real del cliente, la última de la cadena.
 * `TRUSTED_PROXY_HOPS` permite corregirlo sin tocar código si algún día se pone
 * un balanceador delante (un GCLB añadiría dos ⇒ valor 2).
 *
 * El resultado NO viaja como `x-forwarded-for` sino en cabecera propia, que
 * solo ponen nuestros proxies: auth es privada (solo alcanzable desde la VPC),
 * así que nada externo puede falsificarla. Ver `clientIp()` en auth.
 */

import type { NextRequest } from 'next/server';

/** Cabecera propia con la IP del cliente ya resuelta. La consume auth. */
export const CLIENT_IP_HEADER = 'x-mycolegal-client-ip';

/** Entradas que añade la infraestructura al final del XFF. Cloud Run directo = 1. */
function trustedHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Validación deliberadamente laxa: solo descarta basura evidente para no
 * convertir texto arbitrario en clave de rate-limit. No pretende validar
 * direcciones con rigor.
 */
function looksLikeIp(value: string): boolean {
  if (IPV4.test(value)) return value.split('.').every((octet) => Number(octet) <= 255);
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value);
}

/** IP del cliente según la posición que garantiza la infraestructura, o null. */
export function resolveClientIp(request: NextRequest): string | null {
  const header = request.headers.get('x-forwarded-for');
  if (!header) return null;
  const chain = header.split(',').map((entry) => entry.trim()).filter(Boolean);
  const candidate = chain[chain.length - trustedHops()];
  return candidate && looksLikeIp(candidate) ? candidate : null;
}

/**
 * Cabeceras a añadir cuando una ruta de app reenvía a auth. Se construyen desde
 * cero a propósito: nunca se propaga un `CLIENT_IP_HEADER` entrante.
 */
export function clientForwardHeaders(request: NextRequest): Record<string, string> {
  const clientIp = resolveClientIp(request);
  const userAgent = request.headers.get('user-agent');
  return {
    ...(clientIp ? { [CLIENT_IP_HEADER]: clientIp } : {}),
    ...(userAgent ? { 'user-agent': userAgent } : {}),
  };
}
