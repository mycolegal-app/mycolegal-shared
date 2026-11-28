"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { pedirAuthMe } from "../../lib/auth-me";
import { useI18n } from "../i18n/i18n-context";

// #558 — Bienvenida first-run. Se monta UNA vez en el app-shell de cada app
// (como <IncidentReporter/> o <MycoBotRail/>). Es autocontenido: consulta
// `/api/auth/me` para el estado de onboarding + rol, se muestra si procede, y
// marca lo visto en `/api/onboarding/seen`. El alta asistida (solo org_admin,
// una vez global) invita vía `/api/team/invite`. Todas son rutas relativas que
// cada app proxy-fea a auth, de modo que el componente no conoce URLs internas.
//
// Estado (central en auth, ver /apps/user-apps):
//   welcomeSeen: string[]      → appSlugs cuyo tour ya se vio (1 vez por app)
//   teamOnboardingSeen: bool   → alta asistida del org_admin (1 vez global)

export interface WelcomeStep {
  /** Clave estable del paso (para logs/analytics). */
  key: string;
  title: string;
  text: string;
  /** URL de la captura del elemento referido (recorte real de la app). */
  image?: string;
  /** Texto alternativo de la imagen. */
  imageAlt?: string;
  /** Sólo para el org_admin (p. ej. la lista de puesta en marcha). */
  adminOnly?: boolean;
  /** Contenido propio del escenario en lugar de la captura (con scroll si no cabe). */
  content?: React.ReactNode;
}

interface MeOnboarding {
  welcomeSeen?: string[];
  teamOnboardingSeen?: boolean;
}

interface MeResponse {
  authRole?: string;
  role?: string;
  impersonatedBy?: string | null;
  onboarding?: MeOnboarding;
}

interface FirstRunWelcomeProps {
  /** Slug de esta app (ej. "consultor"): clave del flag `welcome:<appSlug>`. */
  appSlug: string;
  /** Nombre visible en la cabecera del modal (ej. "Consultor"). */
  appName: string;
  /** Marca/logo de la app (nodo ya estilizado, ej. un <img> o un badge). */
  logo?: React.ReactNode;
  /** Pasos del tour, con su captura del elemento referido. */
  steps: WelcomeStep[];
  /** Ruta para retomar el alta de usuarios si el org_admin la pospone. */
  adminUrl?: string;
}

interface InviteRow {
  displayName: string;
  email: string;
  /** Por qué no salió la invitación de esta persona (mensaje de auth). */
  error?: string;
  /** El rechazo es por dominio no autorizado: se puede invitar con acuse (#727). */
  fueraDeDominio?: boolean;
  /** El org_admin confirma que la dirección es de su despacho aunque esté fuera de dominio. */
  confirmaFueraDeDominio?: boolean;
}

/** Respuesta de `/api/team/invite`, persona a persona. */
interface InviteResult {
  email: string;
  ok: boolean;
  code?: string | null;
  message?: string;
}

const CODIGOS_FUERA_DE_DOMINIO = new Set(["DOMAIN_NOT_AUTHORIZED", "DOMAIN_NOT_AUTHORIZED_SHARED"]);

const BRAND_GOLD = "#b09a6e";

export function FirstRunWelcome({ appSlug, appName, logo, steps, adminUrl = "/admin" }: FirstRunWelcomeProps) {
  // Textos en el idioma de la notaría (ui.welcome.*, 28-nov: salían en castellano en cat/eus/gal).
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rows, setRows] = useState<InviteRow[]>([
    { displayName: "", email: "" },
    { displayName: "", email: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [teamDone, setTeamDone] = useState<null | "invited" | "later">(null);
  // Aviso general del alta: invitaciones que no han salido (el detalle va en cada fila).
  const [teamError, setTeamError] = useState<string | null>(null);
  // "No volver a mostrar": marcada por defecto (una bienvenida se ve una vez). Si
  // el usuario la desmarca, NO se marca el tour como visto → reaparece la próxima
  // sesión. Solo gobierna el tour de la app; el paso de equipo se marca siempre.
  const [remember, setRemember] = useState(true);
  // Relanzado a mano desde el (?) del toolbar (evento `mycolegal:open-firstrun`):
  // muestra SOLO el tour de la app (no el paso de equipo, que es una acción puntual).
  const [forced, setForced] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  // Decide si mostrarse a partir del estado central de onboarding.
  useEffect(() => {
    let alive = true;
    // Un fallo (red o no-2xx) cae en el catch de abajo: sin datos no se muestra nada.
    pedirAuthMe()
      .then((j) => {
        if (!alive) return;
        const me: MeResponse = j?.data ?? {};
        // Nunca durante impersonación: contaminaría el flag del usuario real.
        if (me.impersonatedBy) return;
        const seen = me.onboarding?.welcomeSeen ?? [];
        const teamSeen = me.onboarding?.teamOnboardingSeen ?? false;
        const admin = (me.authRole ?? me.role) === "org_admin";
        setIsOrgAdmin(admin);
        const w = !seen.includes(appSlug);
        const t = admin && !teamSeen;
        setShowWelcome(w);
        setShowTeam(t);
        setOpen(w || t);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [appSlug]);

  // Relanzar el tour desde el (?) del toolbar. Fuerza la reapertura del tour de la
  // app (ignorando el flag "visto") empezando por el principio; nunca reabre el
  // paso de alta de equipo.
  useEffect(() => {
    const handler = () => {
      setForced(true);
      setI(0);
      setOpen(true);
    };
    window.addEventListener("mycolegal:open-firstrun", handler);
    return () => window.removeEventListener("mycolegal:open-firstrun", handler);
  }, []);

  // Lista efectiva de pasos: en modo relanzado, solo el tour de la app. En
  // arranque, tour (si no visto) + paso de equipo (si org_admin).
  const effectiveSteps = useMemo(() => {
    const visibles = steps.filter((s) => !s.adminOnly || isOrgAdmin);
    if (forced) return visibles;
    const list: WelcomeStep[] = [];
    if (showWelcome) list.push(...visibles);
    if (showTeam) list.push({ key: "team", title: t("ui.welcome.teamTitle"), text: "" });
    return list;
  }, [forced, showWelcome, showTeam, steps, isOrgAdmin, t]);

  // `ready` solo gobierna la apertura AUTOMÁTICA (evita parpadeo antes del fetch);
  // el relanzado manual (`forced`) puede abrir sin esperar.
  if ((!ready && !forced) || !open || effectiveSteps.length === 0) return null;

  const current = effectiveSteps[Math.min(i, effectiveSteps.length - 1)];
  const isTeamStep = current.key === "team";
  const isLast = i === effectiveSteps.length - 1;

  async function mark(key: string) {
    try {
      await fetch("/api/onboarding/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
    } catch {
      /* best-effort: si falla, como mucho reaparece el tour */
    }
  }

  /**
   * Envía las invitaciones. Devuelve `false` si alguna no ha salido: entonces el
   * paso de equipo sigue abierto, sin las que sí salieron y con el motivo en cada
   * fila. Antes no se miraba la respuesta y se decía «Invitaciones enviadas»
   * aunque auth las hubiera rechazado todas (Notaría de Piedrabuena, 24-nov-2026).
   */
  async function invitar(): Promise<boolean> {
    const people = rows
      .map((r) => ({
        displayName: r.displayName.trim(),
        email: r.email.trim(),
        ...(r.fueraDeDominio && r.confirmaFueraDeDominio ? { confirmaFueraDeDominio: true } : {}),
      }))
      .filter((r) => r.displayName && r.email);
    if (people.length === 0) {
      setTeamDone("later");
      return true;
    }
    setTeamError(null);
    let results: InviteResult[] | null = null;
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people }),
      });
      const json = await res.json().catch(() => null);
      results = Array.isArray(json?.data?.results) ? (json.data.results as InviteResult[]) : null;
    } catch {
      results = null;
    }
    if (!results) {
      setTeamError(t("ui.welcome.inviteErrorAll"));
      return false;
    }
    const porEmail = new Map(results.map((r) => [r.email.toLowerCase(), r]));
    const fallidas = rows.filter((r) => {
      const x = porEmail.get(r.email.trim().toLowerCase());
      return r.displayName.trim() && r.email.trim() && x && !x.ok;
    });
    if (fallidas.length === 0) {
      setTeamDone("invited");
      return true;
    }
    const enviadas = results.filter((r) => r.ok).length;
    setRows(
      fallidas.map((r) => {
        const x = porEmail.get(r.email.trim().toLowerCase())!;
        const fuera = CODIGOS_FUERA_DE_DOMINIO.has(x.code ?? "");
        return {
          displayName: r.displayName,
          email: r.email,
          error: x.message || t("ui.welcome.inviteErrorOne"),
          fueraDeDominio: fuera,
          confirmaFueraDeDominio: false,
        };
      }),
    );
    setTeamError(
      (enviadas > 0 ? `${enviadas === 1 ? t("ui.welcome.sentOne") : t("ui.welcome.sentMany", { n: enviadas })}. ` : "") +
        (fallidas.length === 1 ? t("ui.welcome.failedOne") : t("ui.welcome.failedMany", { n: fallidas.length })),
    );
    return false;
  }

  async function finishAll(invite: boolean) {
    setSubmitting(true);
    // Con alguna invitación sin salir, el paso sigue abierto y sin marcar: el
    // org_admin ve por qué y decide (corregir, confirmar o «Ahora no»). Fuera del
    // try/finally, que cierra el modal.
    if (invite && !(await invitar())) {
      if (!forced && showWelcome && remember) await mark(`welcome:${appSlug}`);
      setSubmitting(false);
      return;
    }
    try {
      if (invite) {
        // Ya enviadas todas (o no había a quién): `invitar` ha dejado `teamDone`.
      } else if (showTeam) {
        setTeamDone("later");
      }
      // En relanzado manual (forced) no se re-marca nada: el tour ya se vio y el
      // paso de equipo no forma parte del replay. El tour solo se "recuerda" si la
      // casilla está marcada; el paso de equipo se marca siempre al completarse/posponerse.
      if (!forced) {
        if (showWelcome && remember) await mark(`welcome:${appSlug}`);
        if (showTeam) await mark("team-onboarding");
      }
    } finally {
      setSubmitting(false);
      const withTeam = showTeam && !forced;
      // Pequeña pausa para que se vea el acuse del alta.
      setTimeout(() => { setOpen(false); setForced(false); }, withTeam ? 900 : 0);
      if (!withTeam) { setOpen(false); setForced(false); }
    }
  }

  function next() {
    if (isLast) {
      finishAll(isTeamStep);
    } else {
      setI((n) => n + 1);
    }
  }
  function prev() {
    setI((n) => Math.max(0, n - 1));
  }
  function skip() {
    // "Omitir" / "Ahora no": marca todo como visto sin invitar.
    finishAll(false);
  }

  const primaryLabel = isLast
    ? isTeamStep
      ? t("ui.welcome.sendInvites")
      : t("ui.welcome.start", { app: appName })
    : t("ui.welcome.next");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[500px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Franja de marca (oro canónico) */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${BRAND_GOLD}, #d8c9a6)` }} />

        {/* Cabecera: logo + nombre de app + omitir */}
        <div className="flex items-center gap-3 px-5 pb-1 pt-4">
          {logo ?? (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-600 font-bold text-white">
              {appName.charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t("ui.welcome.headerWelcome")}</div>
            <div className="truncate text-[15px] font-bold tracking-tight text-gray-900">MycoLegal · {appName}</div>
          </div>
          <button
            type="button"
            onClick={skip}
            disabled={submitting}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {isTeamStep ? t("ui.welcome.notNow") : t("ui.welcome.skip")} <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Escenario: captura del elemento o formulario de alta */}
        <div className="relative mx-5 mt-3 h-[204px] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {isTeamStep ? (
            <TeamForm rows={rows} setRows={setRows} done={teamDone} error={teamError} t={t} />
          ) : current.content ? (
            <div className="h-full overflow-y-auto bg-white p-3">{current.content}</div>
          ) : current.image ? (
            <img
              src={current.image}
              alt={current.imageAlt ?? current.title}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3">
              {logo ?? (
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-600 text-2xl font-bold text-white">
                  {appName.charAt(0)}
                </span>
              )}
              <div>
                <div className="text-[15px] font-bold text-gray-900">{appName}</div>
                <div className="text-[12.5px] text-gray-500">{t("ui.welcome.byMycoLegal")}</div>
              </div>
            </div>
          )}
        </div>

        {/* Texto del paso */}
        <div className="px-5 pb-1 pt-3">
          <h2 className="text-[17px] font-bold tracking-tight text-gray-900" style={{ textWrap: "balance" as never }}>
            {current.title}
          </h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] text-gray-600">
            {isTeamStep
              ? teamDone === "invited"
                ? t("ui.welcome.teamDoneText")
                : t("ui.welcome.teamText")
              : current.text}
          </p>
        </div>

        {/* "No volver a mostrar" — solo en el tour de la app (no en el paso de equipo). */}
        {!isTeamStep && (
          <div className="px-5 pt-2">
            <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[12px] text-gray-500">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-cyan-600"
              />
              {t("ui.welcome.dontShowAgain")}
            </label>
          </div>
        )}

        {/* Pie: dots + navegación */}
        <div className="mt-auto flex items-center gap-3 px-5 pb-5 pt-3">
          <div className="flex gap-1.5">
            {effectiveSteps.map((s, idx) => (
              <button
                key={s.key + idx}
                type="button"
                aria-label={t("ui.welcome.stepAria", { n: idx + 1 })}
                onClick={() => setI(idx)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  idx === i ? "w-5 bg-cyan-600" : "w-2 bg-gray-300 hover:bg-gray-400",
                )}
              />
            ))}
          </div>
          <span className="flex-1" />
          {i > 0 && (
            <button
              type="button"
              onClick={prev}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> {t("ui.welcome.prev")}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={submitting}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-cyan-600 px-4 text-[13px] font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {primaryLabel}
            {!isLast && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {isTeamStep && (
          <div className="px-5 pb-4 -mt-2 text-[11.5px] text-gray-400">
            {t("ui.welcome.later")}{" "}
            <a href={adminUrl} className="font-semibold text-cyan-700 hover:underline">
              {t("ui.welcome.laterLink")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamForm({
  rows,
  setRows,
  done,
  error,
  t,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  rows: InviteRow[];
  setRows: React.Dispatch<React.SetStateAction<InviteRow[]>>;
  done: null | "invited" | "later";
  error: string | null;
}) {
  if (done === "invited") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-[13.5px] font-semibold text-cyan-700">{t("ui.welcome.teamDoneShort")}</p>
      </div>
    );
  }
  function update(idx: number, field: "displayName" | "email", value: string) {
    // Al corregir la dirección, el motivo del rechazo anterior ya no vale.
    setRows((prev) => prev.map((r, k) => (k === idx
      ? { ...r, [field]: value, ...(field === "email" ? { error: undefined, fueraDeDominio: false, confirmaFueraDeDominio: false } : {}) }
      : r)));
  }
  function confirmar(idx: number, value: boolean) {
    setRows((prev) => prev.map((r, k) => (k === idx ? { ...r, confirmaFueraDeDominio: value } : r)));
  }
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t("ui.welcome.teamBadge")}</span>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[12px] font-medium text-red-800">
          {error}
        </p>
      )}
      {rows.map((r, idx) => (
        <div key={idx} className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_1.3fr] gap-1.5">
            <input
              value={r.displayName}
              onChange={(e) => update(idx, "displayName", e.target.value)}
              placeholder={t("ui.welcome.namePlaceholder")}
              className="h-8 min-w-0 rounded-lg border border-gray-200 px-2 text-[12px] outline-none focus:border-cyan-500"
            />
            <input
              value={r.email}
              onChange={(e) => update(idx, "email", e.target.value)}
              placeholder={t("ui.welcome.emailPlaceholder")}
              type="email"
              className={cn(
                "h-8 min-w-0 rounded-lg border px-2 text-[12px] outline-none focus:border-cyan-500",
                r.error ? "border-red-300" : "border-gray-200",
              )}
            />
          </div>
          {r.error && <p className="text-[11.5px] leading-snug text-red-700">{r.error}</p>}
          {r.fueraDeDominio && (
            <label className="flex cursor-pointer items-start gap-2 text-[11.5px] font-medium leading-snug text-red-900">
              <input
                type="checkbox"
                checked={!!r.confirmaFueraDeDominio}
                onChange={(e) => confirmar(idx, e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-red-300"
              />
              <span>{t("ui.welcome.confirmOutsideDomain")}</span>
            </label>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { displayName: "", email: "" }])}
        className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-[12px] text-gray-500 hover:border-cyan-400 hover:text-cyan-700"
      >
        <Plus className="h-3.5 w-3.5" /> {t("ui.welcome.addPerson")}
      </button>
      <span className="text-[11px] text-gray-400">{t("ui.welcome.inviteNote")}</span>
    </div>
  );
}
