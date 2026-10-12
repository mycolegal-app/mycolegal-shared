// `/api/auth/me` UNA vez por página, no una por componente (12-oct-2026).
//
// El AppShell, MycoBot, la bienvenida del primer acceso y `useIsOrgAdmin` lo pedían cada uno al
// montarse: cuatro peticiones a la vez en cada carga de página (visto en las trazas del e2e de
// test), y cada una baja a su vez al servicio de auth, que con su pool corto era el cuello de
// botella de la flota en test (11-oct-2026). Aquí se comparte la petición en curso y se guarda la
// respuesta buena unos segundos: lo que se monta casi a la vez recibe lo mismo.
//
// Lo que NO se guarda: los errores (quien reintenta —el AppShell— vuelve a pedir de verdad).
// Lo que se devuelve es el JSON tal cual (`{ data: … }`); cada app sirve su forma y cada
// componente lo lee como antes. Es compartido: quien lo use no lo debe mutar.

const VIDA_MS = 5_000;
const TECHO_MS = 8_000;

let enCurso: Promise<unknown> | null = null;
let ultima: { at: number; json: unknown } | null = null;

/** El JSON de `/api/auth/me`. Rechaza si no responde (8 s) o no es 2xx. */
export function pedirAuthMe(): Promise<any> {
  if (ultima && Date.now() - ultima.at < VIDA_MS) return Promise.resolve(ultima.json);
  if (enCurso) return enCurso;
  const controller = new AbortController();
  const techo = setTimeout(() => controller.abort(), TECHO_MS);
  const p = fetch("/api/auth/me", { signal: controller.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`me ${r.status}`);
      return r.json();
    })
    .then((json) => {
      ultima = { at: Date.now(), json };
      return json;
    })
    .finally(() => {
      clearTimeout(techo);
      if (enCurso === p) enCurso = null;
    });
  enCurso = p;
  return p;
}

/** Olvida lo guardado: al cerrar sesión, o tras cambiar el perfil. */
export function olvidarAuthMe(): void {
  ultima = null;
}
