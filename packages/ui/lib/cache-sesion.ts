// Datos del armazón que casi no cambian, guardados en sessionStorage unos minutos (11-nov-2026).
//
// Cada clic recarga la página entera (NavLink navega con `window.location.href`), y en cada carga
// el armazón volvía a pedir lo mismo: versión, avisos legales, skills y capacidades de MycoBot,
// empleados… En notaria eran ~16 peticiones a la vez por página, que compiten por la misma
// instancia y triplican la latencia de todas (p50 23 ms sola → 220 ms con 10+ a la vez).
//
// sessionStorage es por origen (por app) y por pestaña, y se vacía al cerrarla. Además
// `olvidarCacheDeSesion` se llama desde `clearMeCache` (logout/timeout) para que otro usuario en
// la misma pestaña no herede nada. Si sessionStorage no está disponible, se pide a la red.
//
// Lo que NO se guarda: los errores, salvo los estados que el llamador declare estables (p. ej. el
// 404/501 de «esta app no tiene tienda de skills»).

const PREFIJO = "mc:cs:v1:";

export interface RespuestaCacheada<T = any> {
  status: number;
  ok: boolean;
  json: T | null;
}

export interface OpcionesCacheSesion<T> {
  /** Cuánto vale lo guardado. */
  vidaMs: number;
  /** Ignora lo guardado y pide de nuevo (tras una escritura que lo cambia). */
  forzar?: boolean;
  /** Estados no-2xx que también se guardan por ser estables. */
  estadosEstables?: number[];
  /** Filtro final: devolver `false` para no guardar esta respuesta concreta. */
  guardarSi?: (json: T | null) => boolean;
}

const enCurso = new Map<string, Promise<RespuestaCacheada>>();

function leer(url: string, vidaMs: number): RespuestaCacheada | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIJO + url);
    if (!raw) return null;
    const g = JSON.parse(raw) as { at: number; r: RespuestaCacheada };
    return Date.now() - g.at < vidaMs ? g.r : null;
  } catch {
    return null;
  }
}

function escribir(url: string, r: RespuestaCacheada): void {
  try {
    window.sessionStorage.setItem(PREFIJO + url, JSON.stringify({ at: Date.now(), r }));
  } catch {
    /* sessionStorage lleno/bloqueado — degradamos a solo-red */
  }
}

/**
 * GET de `url` con caché en sessionStorage. Comparte la petición en curso entre quienes la piden a
 * la vez. Nunca rechaza: un fallo de red vuelve como `{ status: 0, ok: false, json: null }`.
 */
export function pedirConCacheDeSesion<T = any>(
  url: string,
  opciones: OpcionesCacheSesion<T>,
): Promise<RespuestaCacheada<T>> {
  if (!opciones.forzar) {
    const g = leer(url, opciones.vidaMs);
    if (g) return Promise.resolve(g as RespuestaCacheada<T>);
    const p = enCurso.get(url);
    if (p) return p as Promise<RespuestaCacheada<T>>;
  }
  const p: Promise<RespuestaCacheada<T>> = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      const json = (await res.json().catch(() => null)) as T | null;
      const r = { status: res.status, ok: res.ok, json };
      const estable = res.ok || (opciones.estadosEstables ?? []).includes(res.status);
      if (estable && (opciones.guardarSi?.(json) ?? true)) escribir(url, r);
      return r;
    })
    .catch(() => ({ status: 0, ok: false, json: null }))
    .finally(() => {
      if (enCurso.get(url) === p) enCurso.delete(url);
    });
  enCurso.set(url, p);
  return p;
}

/** Olvida lo guardado: una URL, o todo (logout/timeout). */
export function olvidarCacheDeSesion(url?: string): void {
  try {
    if (url) {
      window.sessionStorage.removeItem(PREFIJO + url);
      return;
    }
    const claves: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(PREFIJO)) claves.push(k);
    }
    claves.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
