"use client";

/**
 * #1045 — «Roles y permisos de MycoLegal»: sección común del manual que se
 * GENERA de los datos reales. Para cada aplicación (las contratadas por la
 * organización o, a elección del lector, todas las de MycoLegal) pinta una tabla
 * rol × permiso agrupada por área, con las etiquetas legibles que cada app
 * declara al registrarse en auth (`AppRole` + `AppPermission`).
 *
 * Fuente: `GET /api/manual/roles-matrix?scope=org|all` (passthrough de
 * `createManualRolesMatrixRoute` de sharedlib a auth `/roles-catalog/apps-matrix`).
 * Si la app aún no monta esa ruta, prueba `/api/admin/usuarios/apps-catalog`
 * (sólo responde a quien gestiona usuarios; sin etiquetas legibles). Sin sesión
 * o sin datos, pinta un aviso y el resto del manual sigue funcionando.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Info, Loader2, Lock, ShieldCheck, SlidersHorizontal, Star, Users } from "lucide-react";

import { roleColor } from "../admin/role-catalog";
import {
  buildAppMatrix,
  fromAppsCatalog,
  parseRolesMatrix,
  type RolesMatrixData,
} from "../../lib/roles-matrix";
import type { ManualLang } from "./admin-users-section";

export const ROLES_MATRIX_ANCHOR = "roles-mycolegal";

export interface RolesMatrixSectionProps {
  lang: ManualLang;
  /** Slug de la app que está leyendo el manual: su tabla sale abierta y la primera. */
  appSlug?: string;
  /** Nombre visible de la app (respaldo para localizarla si no hay `appSlug`). */
  appName?: string;
  /** Ruta de datos. Default: `/api/manual/roles-matrix`. */
  endpoint?: string;
  /** Ruta de respaldo (admin). `null` para no usarla. Default: `/api/admin/usuarios/apps-catalog`. */
  fallbackEndpoint?: string | null;
  /** Alcance inicial. Default: `org` (las apps contratadas por la organización). */
  initialScope?: "org" | "all";
}

interface Strings {
  title: string;
  intro: string;
  notSameTitle: string;
  notSame: string;
  customTitle: string;
  custom: string;
  reservedTitle: string;
  reserved: string;
  scopeOrg: string;
  scopeAll: string;
  loading: string;
  noSession: string;
  error: string;
  empty: string;
  fallbackNote: string;
  scopeFellBack: string;
  whatIsTitle: string;
  rolesInApp: (n: number) => string;
  fullAccess: string;
  orgAdmin: string;
  byDefault: string;
  colPermission: string;
  reservedBadge: string;
  yes: string;
  no: string;
  labelsNote: string;
}

const STRINGS: Record<ManualLang, Strings> = {
  CAST: {
    title: "Roles y permisos de MycoLegal",
    intro:
      "Esta tabla se genera con los datos reales de la plataforma: los roles que declara cada aplicación y los permisos concretos que incluye cada uno, agrupados por área. Es la misma información que usa el panel de usuarios al asignar un rol.",
    notSameTitle: "Los roles son de cada aplicación",
    notSame:
      "Un mismo nombre de rol no da los mismos permisos en todas las aplicaciones. «Usuario de notaría», por ejemplo, es el perfil de trabajo ordinario en cada app, pero cada una decide qué incluye: en LegiFirma son actuaciones, libro y recepciones; en Notaría, expedientes, protocolos y trámites. Por eso a una persona se le asigna un rol por aplicación, y puede tener roles distintos en cada una.",
    customTitle: "Qué es «A medida»",
    custom:
      "Además de los roles predefinidos, el administrador puede ajustar los permisos de una persona uno a uno (Administración → Usuarios → Editar → Permisos → icono de ajustes de la app). Si los permisos ya no coinciden con ningún rol, el usuario aparece como «A medida»: sus permisos son exactamente los marcados, no los de la tabla.",
    reservedTitle: "Permisos reservados",
    reserved:
      "Algunos permisos tocan contenido común a todas las notarías (por ejemplo, revisar o publicar resoluciones del corpus o moderar el foro). No los incluye el acceso completo del administrador de notaría y solo los concede un superadministrador de MycoLegal. En la tabla llevan la marca «Reservado».",
    scopeOrg: "Aplicaciones de mi organización",
    scopeAll: "Todas las aplicaciones de MycoLegal",
    loading: "Cargando los roles…",
    noSession:
      "Inicia sesión en la aplicación para ver aquí la tabla de roles y permisos generada con los datos reales.",
    error:
      "No se ha podido cargar la tabla de roles en este momento. El administrador de tu organización puede consultar los permisos de cada rol en Administración → Usuarios → Editar → Permisos → «¿Qué puede hacer este rol?».",
    empty: "No hay aplicaciones con roles declarados para mostrar.",
    fallbackNote:
      "Vista reducida: esta aplicación aún no publica las descripciones de los permisos, así que se muestran sus claves técnicas agrupadas por área.",
    scopeFellBack: "Tu cuenta no tiene aplicaciones contratadas propias: se muestran todas las de MycoLegal.",
    whatIsTitle: "¿Qué es cada rol?",
    rolesInApp: (n) => (n === 1 ? "1 rol" : `${n} roles`),
    fullAccess: "Acceso completo (salvo reservados)",
    orgAdmin: "Administra la organización",
    byDefault: "Por defecto al invitar",
    colPermission: "Área / permiso",
    reservedBadge: "Reservado",
    yes: "Sí",
    no: "No",
    labelsNote: "",
  },
  CAT: {
    title: "Rols i permisos de MycoLegal",
    intro:
      "Aquesta taula es genera amb les dades reals de la plataforma: els rols que declara cada aplicació i els permisos concrets que inclou cadascun, agrupats per àrea. És la mateixa informació que fa servir el panell d'usuaris en assignar un rol.",
    notSameTitle: "Els rols són de cada aplicació",
    notSame:
      "Un mateix nom de rol no dona els mateixos permisos a totes les aplicacions. «Usuari de notaria», per exemple, és el perfil de treball ordinari a cada app, però cadascuna decideix què inclou: a LegiFirma són actuacions, llibre i recepcions; a Notaria, expedients, protocols i tràmits. Per això a una persona se li assigna un rol per aplicació, i pot tenir rols diferents a cadascuna.",
    customTitle: "Què és «A mida»",
    custom:
      "A més dels rols predefinits, l'administrador pot ajustar els permisos d'una persona un a un (Administració → Usuaris → Editar → Permisos → icona d'ajustos de l'app). Si els permisos ja no coincideixen amb cap rol, l'usuari apareix com a «A mida»: els seus permisos són exactament els marcats, no els de la taula.",
    reservedTitle: "Permisos reservats",
    reserved:
      "Alguns permisos toquen contingut comú a totes les notaries (per exemple, revisar o publicar resolucions del corpus o moderar el fòrum). No els inclou l'accés complet de l'administrador de notaria i només els concedeix un superadministrador de MycoLegal. A la taula porten la marca «Reservat».",
    scopeOrg: "Aplicacions de la meva organització",
    scopeAll: "Totes les aplicacions de MycoLegal",
    loading: "Carregant els rols…",
    noSession:
      "Inicia sessió a l'aplicació per veure aquí la taula de rols i permisos generada amb les dades reals.",
    error:
      "No s'ha pogut carregar la taula de rols en aquest moment. L'administrador de la teva organització pot consultar els permisos de cada rol a Administració → Usuaris → Editar → Permisos → «Què pot fer aquest rol?».",
    empty: "No hi ha aplicacions amb rols declarats per mostrar.",
    fallbackNote:
      "Vista reduïda: aquesta aplicació encara no publica les descripcions dels permisos, així que es mostren les seves claus tècniques agrupades per àrea.",
    scopeFellBack: "El teu compte no té aplicacions contractades pròpies: es mostren totes les de MycoLegal.",
    whatIsTitle: "Què és cada rol?",
    rolesInApp: (n) => (n === 1 ? "1 rol" : `${n} rols`),
    fullAccess: "Accés complet (excepte reservats)",
    orgAdmin: "Administra l'organització",
    byDefault: "Per defecte en convidar",
    colPermission: "Àrea / permís",
    reservedBadge: "Reservat",
    yes: "Sí",
    no: "No",
    labelsNote:
      "Els noms dels rols i dels permisos es mostren tal com els declara cada aplicació (en castellà).",
  },
  EUS: {
    title: "MycoLegal-eko rolak eta baimenak",
    intro:
      "Taula hau plataformaren benetako datuekin sortzen da: aplikazio bakoitzak adierazten dituen rolak eta bakoitzak dituen baimen zehatzak, arloka multzokatuta. Erabiltzaileen panelak rol bat esleitzean erabiltzen duen informazio bera da.",
    notSameTitle: "Rolak aplikazio bakoitzarenak dira",
    notSame:
      "Rol-izen berak ez ditu baimen berak ematen aplikazio guztietan. «Notaritzako erabiltzailea», adibidez, app bakoitzeko lan-profil arrunta da, baina bakoitzak erabakitzen du zer barne hartzen duen: LegiFirman jarduketak, liburua eta harrerak; Notaritzan, espedienteak, protokoloak eta izapideak. Horregatik, pertsona bati rol bat esleitzen zaio aplikazio bakoitzeko, eta rol desberdinak izan ditzake bakoitzean.",
    customTitle: "Zer da «Neurrira»",
    custom:
      "Aurrez definitutako rolez gain, administratzaileak pertsona baten baimenak banan-banan doi ditzake (Administrazioa → Erabiltzaileak → Editatu → Baimenak → apparen doikuntza-ikonoa). Baimenak jada ez badatoz bat inongo rolekin, erabiltzailea «Neurrira» gisa agertzen da: bere baimenak markatutakoak dira zehazki, ez taulakoak.",
    reservedTitle: "Baimen erreserbatuak",
    reserved:
      "Baimen batzuek notaritza guztientzat komuna den edukia ukitzen dute (adibidez, corpuseko ebazpenak berrikusi edo argitaratu, edo foroa moderatu). Notaritzako administratzailearen sarbide osoak ez ditu barne hartzen, eta MycoLegal-eko superadministratzaile batek bakarrik ematen ditu. Taulan «Erreserbatua» marka daramate.",
    scopeOrg: "Nire erakundeko aplikazioak",
    scopeAll: "MycoLegal-eko aplikazio guztiak",
    loading: "Rolak kargatzen…",
    noSession:
      "Hasi saioa aplikazioan, benetako datuekin sortutako rol eta baimenen taula hemen ikusteko.",
    error:
      "Ezin izan da rolen taula kargatu une honetan. Zure erakundeko administratzaileak rol bakoitzaren baimenak kontsulta ditzake hemen: Administrazioa → Erabiltzaileak → Editatu → Baimenak → «Zer egin dezake rol honek?».",
    empty: "Ez dago erakusteko rolak adierazita dituen aplikaziorik.",
    fallbackNote:
      "Ikuspegi murriztua: aplikazio honek oraindik ez ditu baimenen deskribapenak argitaratzen, beraz haien gako teknikoak erakusten dira, arloka multzokatuta.",
    scopeFellBack: "Zure kontuak ez du kontratatutako aplikazio propiorik: MycoLegal-eko guztiak erakusten dira.",
    whatIsTitle: "Zer da rol bakoitza?",
    rolesInApp: (n) => `${n} rol`,
    fullAccess: "Sarbide osoa (erreserbatuak izan ezik)",
    orgAdmin: "Erakundea administratzen du",
    byDefault: "Lehenetsia gonbidatzean",
    colPermission: "Arloa / baimena",
    reservedBadge: "Erreserbatua",
    yes: "Bai",
    no: "Ez",
    labelsNote:
      "Rolen eta baimenen izenak aplikazio bakoitzak adierazten dituen bezala erakusten dira (gaztelaniaz).",
  },
  GAL: {
    title: "Roles e permisos de MycoLegal",
    intro:
      "Esta táboa xérase cos datos reais da plataforma: os roles que declara cada aplicación e os permisos concretos que inclúe cada un, agrupados por área. É a mesma información que usa o panel de usuarios ao asignar un rol.",
    notSameTitle: "Os roles son de cada aplicación",
    notSame:
      "Un mesmo nome de rol non dá os mesmos permisos en todas as aplicacións. «Usuario de notaría», por exemplo, é o perfil de traballo ordinario en cada app, pero cada unha decide que inclúe: en LegiFirma son actuacións, libro e recepcións; en Notaría, expedientes, protocolos e trámites. Por iso a unha persoa asígnaselle un rol por aplicación, e pode ter roles distintos en cada unha.",
    customTitle: "Que é «Á medida»",
    custom:
      "Ademais dos roles predefinidos, o administrador pode axustar os permisos dunha persoa un a un (Administración → Usuarios → Editar → Permisos → icona de axustes da app). Se os permisos xa non coinciden con ningún rol, o usuario aparece como «Á medida»: os seus permisos son exactamente os marcados, non os da táboa.",
    reservedTitle: "Permisos reservados",
    reserved:
      "Algúns permisos tocan contido común a todas as notarías (por exemplo, revisar ou publicar resolucións do corpus ou moderar o foro). Non os inclúe o acceso completo do administrador de notaría e só os concede un superadministrador de MycoLegal. Na táboa levan a marca «Reservado».",
    scopeOrg: "Aplicacións da miña organización",
    scopeAll: "Todas as aplicacións de MycoLegal",
    loading: "Cargando os roles…",
    noSession:
      "Inicia sesión na aplicación para ver aquí a táboa de roles e permisos xerada cos datos reais.",
    error:
      "Non se puido cargar a táboa de roles neste momento. O administrador da túa organización pode consultar os permisos de cada rol en Administración → Usuarios → Editar → Permisos → «Que pode facer este rol?».",
    empty: "Non hai aplicacións con roles declarados para amosar.",
    fallbackNote:
      "Vista reducida: esta aplicación aínda non publica as descricións dos permisos, así que se amosan as súas claves técnicas agrupadas por área.",
    scopeFellBack: "A túa conta non ten aplicacións contratadas propias: amósanse todas as de MycoLegal.",
    whatIsTitle: "Que é cada rol?",
    rolesInApp: (n) => (n === 1 ? "1 rol" : `${n} roles`),
    fullAccess: "Acceso completo (agás reservados)",
    orgAdmin: "Administra a organización",
    byDefault: "Por defecto ao convidar",
    colPermission: "Área / permiso",
    reservedBadge: "Reservado",
    yes: "Si",
    no: "Non",
    labelsNote:
      "Os nomes dos roles e dos permisos amósanse tal como os declara cada aplicación (en castelán).",
  },
};

type LoadState =
  | { status: "loading" }
  | { status: "noSession" }
  | { status: "error" }
  | { status: "ok"; data: RolesMatrixData; fallback: boolean };

async function loadMatrix(
  endpoint: string,
  fallbackEndpoint: string | null,
  scope: "org" | "all",
): Promise<LoadState> {
  if (typeof fetch !== "function") return { status: "error" };
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`${endpoint}${sep}scope=${scope}`, { credentials: "same-origin" });
  if (res.ok) return { status: "ok", data: parseRolesMatrix(await res.json()), fallback: false };
  if (res.status === 401) return { status: "noSession" };
  // La app aún no monta la ruta del manual: respaldo con el catálogo del panel.
  if (res.status === 404 && fallbackEndpoint) {
    const fb = await fetch(fallbackEndpoint, { credentials: "same-origin" });
    if (fb.ok) return { status: "ok", data: fromAppsCatalog(await fb.json()), fallback: true };
    if (fb.status === 401) return { status: "noSession" };
  }
  return { status: "error" };
}

function Callout({
  icon: Icon,
  title,
  text,
  tone,
}: {
  icon: typeof Info;
  title: string;
  text: string;
  tone: "cyan" | "amber" | "gray";
}) {
  const box =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "cyan"
        ? "border-cyan-200 bg-cyan-50"
        : "border-gray-100 bg-gray-50";
  const ink = tone === "amber" ? "text-amber-800" : tone === "cyan" ? "text-cyan-800" : "text-gray-700";
  const ico = tone === "amber" ? "text-amber-600" : tone === "cyan" ? "text-cyan-600" : "text-gray-500";
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${box}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ico}`} />
      <div className={`text-sm ${ink}`}>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function AppMatrix({
  app,
  t,
  open,
}: {
  app: RolesMatrixData["apps"][number];
  t: Strings;
  open: boolean;
}) {
  const { roles, groups } = useMemo(() => buildAppMatrix(app), [app]);

  return (
    <details open={open} className="group rounded-xl border border-gray-100 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3">
        <span className="text-sm font-semibold text-gray-900">{app.name}</span>
        <span className="text-xs text-gray-500">{t.rolesInApp(roles.length)}</span>
      </summary>

      <div className="space-y-4 border-t border-gray-100 px-5 py-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <li key={r.key} className="rounded-lg border border-gray-100 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${roleColor(r.key)}`}
                >
                  {r.label}
                </span>
                {r.isAdminDefault && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-purple-700">
                    <ShieldCheck className="h-3 w-3" />
                    {t.orgAdmin}
                  </span>
                )}
                {r.isDefault && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                    <Star className="h-3 w-3" />
                    {t.byDefault}
                  </span>
                )}
              </div>
              {r.description && <p className="mt-1 text-xs text-gray-600">{r.description}</p>}
              {r.fullAccess && <p className="mt-1 text-xs font-medium text-emerald-700">{t.fullAccess}</p>}
            </li>
          ))}
        </ul>

        {groups.length > 0 && roles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3 font-semibold">{t.colPermission}</th>
                  {roles.map((r) => (
                    <th key={r.key} className="px-2 py-2 text-center font-semibold" scope="col">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.group} group={g} colSpan={roles.length + 1} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function GroupRows({
  group,
  colSpan,
  t,
}: {
  group: ReturnType<typeof buildAppMatrix>["groups"][number];
  colSpan: number;
  t: Strings;
}) {
  return (
    <>
      <tr className="bg-gray-50">
        <th
          colSpan={colSpan}
          scope="colgroup"
          className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
        >
          {group.group}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.key} className="border-b border-gray-100 last:border-0">
          <td className="py-1.5 pr-3 text-gray-700">
            <span title={row.description ?? row.key}>{row.label}</span>
            {row.reserved && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">
                <Lock className="h-2.5 w-2.5" />
                {t.reservedBadge}
              </span>
            )}
          </td>
          {row.cells.map((on, i) => (
            <td key={i} className="px-2 py-1.5 text-center">
              {on ? (
                <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label={t.yes} />
              ) : (
                <span className="text-gray-300" aria-label={t.no}>
                  —
                </span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function RolesMatrixSection({
  lang,
  appSlug,
  appName,
  endpoint = "/api/manual/roles-matrix",
  fallbackEndpoint = "/api/admin/usuarios/apps-catalog",
  initialScope = "org",
}: RolesMatrixSectionProps) {
  const t = STRINGS[lang] ?? STRINGS.CAST;
  const [scope, setScope] = useState<"org" | "all">(initialScope);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadMatrix(endpoint, fallbackEndpoint, scope)
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [endpoint, fallbackEndpoint, scope]);

  // La app que lee el manual, primero y abierta.
  const apps = useMemo(() => {
    if (state.status !== "ok") return [];
    const list = state.data.apps.filter((a) => a.roles.length > 0);
    const isCurrent = (a: { slug: string; name: string }) =>
      (appSlug && a.slug === appSlug) ||
      (!appSlug && appName && a.name.toLowerCase() === appName.toLowerCase());
    return [...list.filter(isCurrent), ...list.filter((a) => !isCurrent(a))];
  }, [state, appSlug, appName]);

  // Significado común de los roles que aparecen (catálogo unificado #78).
  const catalog = useMemo(() => {
    if (state.status !== "ok") return [];
    const shown = new Set(apps.flatMap((a) => a.roles.map((r) => r.key)));
    return state.data.roleCatalog.filter((c) => shown.has(c.codigo) && c.descripcion);
  }, [state, apps]);

  const fellBack = state.status === "ok" && scope === "org" && state.data.scope === "all";

  return (
    <section id={ROLES_MATRIX_ANCHOR} className="space-y-4">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t.title}</h2>
      <p className="text-sm leading-relaxed text-gray-600">{t.intro}</p>

      <div className="grid gap-3">
        <Callout icon={Users} tone="cyan" title={t.notSameTitle} text={t.notSame} />
        <Callout icon={SlidersHorizontal} tone="gray" title={t.customTitle} text={t.custom} />
        <Callout icon={Lock} tone="amber" title={t.reservedTitle} text={t.reserved} />
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs" role="group">
        {(["org", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            aria-pressed={scope === s}
            className={`rounded-md px-3 py-1.5 font-medium ${
              scope === s ? "bg-cyan-600 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s === "org" ? t.scopeOrg : t.scopeAll}
          </button>
        ))}
      </div>

      {state.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.status === "noSession" && <Callout icon={Info} tone="gray" title={t.title} text={t.noSession} />}
      {state.status === "error" && <Callout icon={Info} tone="gray" title={t.title} text={t.error} />}

      {state.status === "ok" && (
        <div className="space-y-3">
          {state.fallback && <p className="text-xs text-gray-500">{t.fallbackNote}</p>}
          {fellBack && <p className="text-xs text-gray-500">{t.scopeFellBack}</p>}
          {t.labelsNote && <p className="text-xs text-gray-500">{t.labelsNote}</p>}

          {catalog.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">{t.whatIsTitle}</h3>
              <dl className="space-y-1.5">
                {catalog.map((c) => (
                  <div key={c.codigo} className="text-sm">
                    <dt className="inline font-semibold text-gray-800">{c.label}: </dt>
                    <dd className="inline text-gray-600">{c.descripcion}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {apps.length === 0 ? (
            <p className="text-sm text-gray-500">{t.empty}</p>
          ) : (
            apps.map((a, i) => <AppMatrix key={a.slug} app={a} t={t} open={i === 0} />)
          )}
        </div>
      )}
    </section>
  );
}
