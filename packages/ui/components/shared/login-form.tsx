"use client";

import { useState, type FormEvent } from "react";
import { cn } from "../../lib/utils";
import { PasswordInput } from "./password-input";
import { useI18n } from "../i18n/i18n-context";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface LoginFormProps {
  /** App display name shown in the header */
  appName: string;
  /** Optional SVG logo markup (dangerouslySetInnerHTML) */
  appLogoSvg?: string;
  /** Optional logo image URL (alternative to SVG) */
  appLogoUrl?: string;
  /** App accent color class for the brand highlight, e.g. "text-mc-primary-400" */
  accentClass?: string;
  /** Subtitle shown below the app name */
  subtitle?: string;
  /** Optional hero image URL shown on the left branding panel */
  heroImageUrl?: string;
  /** Optional bullet points shown on the left branding panel */
  features?: string[];
  /** API endpoint to POST credentials to (defaults to /api/auth/login) */
  loginEndpoint?: string;
  /**
   * API endpoint for the expired-password change (defaults to
   * /api/auth/password/expired). Used when login returns PASSWORD_EXPIRED.
   */
  expiredPasswordEndpoint?: string;
  /**
   * API endpoint for the AUTHENTICATED password change (defaults to
   * /api/auth/change-password). Used from the "your password expires in N days"
   * notice shown after a successful login: the session cookie is already set.
   */
  changePasswordEndpoint?: string;
  /** URL to redirect to after successful login */
  redirectTo?: string;
  /** Callback after successful login (alternative to redirectTo) */
  onSuccess?: (data: { token: string; user: Record<string, unknown> }) => void;
  /** Version info shown discreetly in the bottom-left corner */
  versionInfo?: { platform?: string; ui?: string; sharedlib?: string };
  /**
   * URL del enlace "¿Olvidaste tu contraseña?". Por defecto la ruta relativa
   * `/forgot-password` (legacy, in-app). En la plataforma actual el flujo de
   * recuperación vive en landing — pásale la URL absoluta del portal
   * (`${PORTAL_URL}/forgot-password`) para que el enlace cruce de subdominio.
   */
  forgotPasswordUrl?: string;
}

/**
 * Destino post-login preservado por el guard de 401 (`?returnTo=`, p.ej. el
 * `/foro/vincular?t=…` del /link). Se valida para evitar open-redirect: solo
 * rutas relativas del mismo origen (empiezan por "/" pero no "//" ni "/\"").
 * Devuelve null si no hay o no es segura → se usa el `redirectTo` por defecto.
 */
function safeReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const rt = new URLSearchParams(window.location.search).get("returnTo");
  if (!rt || !rt.startsWith("/") || rt.startsWith("//") || rt.startsWith("/\\")) return null;
  return rt;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Respuesta de un login correcto tal como la reenvían los proxies de las apps. */
type LoginSuccess = {
  data?: { mustChangePassword?: boolean; passwordExpiresInDays?: number | null; [k: string]: unknown };
  mustChangePassword?: boolean;
  passwordExpiresInDays?: number | null;
  [k: string]: unknown;
};

/** Longitud mínima de contraseña (alineada con el resto de formularios de cambio). */
const PASSWORD_MIN_LENGTH = 12;

/**
 * `error.code` del backend de auth → clave i18n localizada. Sustituye a mostrar
 * el `message` crudo (a menudo en inglés, p.ej. "Invalid credentials"). Los
 * códigos los añade auth.service en cada throw del login.
 */
const LOGIN_ERROR_KEYS: Record<string, string> = {
  INVALID_CREDENTIALS: "errInvalidCredentials",
  ORG_SUSPENDED: "errOrgSuspended",
  USER_SUSPENDED: "errUserSuspended",
  USER_INACTIVE: "errUserInactive",
  ACCOUNT_LOCKED: "errAccountLocked",
  APP_ACCESS_DENIED: "errAppAccess",
  APP_MAINTENANCE: "errAppMaintenance",
  PASSWORD_SAME: "errPasswordSame",
  CURRENT_PASSWORD_INVALID: "errCurrentPassword",
  WEAK_PASSWORD: "errWeakPassword",
  RATE_LIMITED: "errRateLimited",
  REGISTRATION_INCOMPLETE: "errRegistrationIncomplete",
  INVALID_TOTP: "errInvalidTotp",
  MFA_TOKEN_EXPIRED: "errTotpExpired",
  MFA_TOKEN_INVALID: "errTotpExpired",
};

/**
 * Códigos cuyo `message` puede venir personalizado por el administrador
 * (mensaje de suspensión, de mantenimiento): si llega, gana al literal genérico.
 */
const PREFER_BACKEND_MESSAGE = new Set(["USER_SUSPENDED", "APP_MAINTENANCE"]);

/** Resuelve el texto a mostrar ante un error del login/cambio, priorizando i18n. */
function resolveLoginError(t: TFn, status: number, code?: string, message?: string): string {
  // Fastify rate-limit devuelve 429 con "Too Many Requests" (inglés) y sin code.
  if (status === 429) return t("ui.login.errRateLimited");

  const key = code ? LOGIN_ERROR_KEYS[code] : undefined;
  if (key) {
    if (code && PREFER_BACKEND_MESSAGE.has(code) && message && message.trim()) return message;
    return t(`ui.login.${key}`, { min: String(PASSWORD_MIN_LENGTH) });
  }

  // Código desconocido: usa el mensaje del backend salvo que sea el placeholder
  // crudo en inglés; en 5xx nunca (puede filtrar detalles internos).
  const msg = message?.trim();
  if (msg && status < 500 && msg.toLowerCase() !== "invalid credentials") return msg;
  return t("ui.login.errAuth");
}

export function LoginForm({
  appName,
  appLogoSvg,
  appLogoUrl,
  accentClass = "text-mc-primary-400",
  subtitle,
  heroImageUrl,
  features,
  loginEndpoint = "/api/auth/login",
  expiredPasswordEndpoint = "/api/auth/password/expired",
  changePasswordEndpoint = "/api/auth/change-password",
  redirectTo = "/",
  onSuccess,
  versionInfo,
  forgotPasswordUrl = "/forgot-password",
}: LoginFormProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Org selection state (superadmin flow)
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [selectToken, setSelectToken] = useState<string | null>(null);
  // Última org elegida por el superadmin (auth la recuerda, una para todas las
  // apps): se pinta marcada y con el foco, así que basta con pulsar Intro.
  const [lastOrgId, setLastOrgId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  // Segundo factor (superadmin con TOTP, 27-oct-2026): token intermedio del primer
  // paso y el código tecleado (6 dígitos o uno de respaldo).
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [usarRespaldo, setUsarRespaldo] = useState(false);

  // Pending-activation state (invited user logging in — we resend the activation email)
  const [pendingActivation, setPendingActivation] = useState<{ email: string; message: string } | null>(null);

  // Expired-password state: login returned PASSWORD_EXPIRED, so we show an inline
  // "current + new + repeat" dialog. `expiredCurrent` is prefilled with the
  // password the user just typed (login already validated it — it's correct,
  // only expired), so they only need to choose a new one.
  const [expired, setExpired] = useState(false);
  const [expiredCurrent, setExpiredCurrent] = useState("");
  const [expiredNew, setExpiredNew] = useState("");
  const [expiredConfirm, setExpiredConfirm] = useState("");
  // El mismo formulario sirve para dos casos: la contraseña YA caducada (sin
  // sesión, /api/auth/password/expired) y el cambio voluntario desde el aviso
  // «caduca en N días» (con sesión, /api/auth/change-password).
  const [pwMode, setPwMode] = useState<"expired" | "change">("expired");

  // Aviso «tu contraseña caduca en N días» tras un login correcto (auth manda
  // `passwordExpiresInDays` cuando quedan 14 o menos). No bloquea: «Más tarde»
  // sigue al destino normal con la respuesta del login guardada aquí.
  const [expiring, setExpiring] = useState<{ days: number; data: LoginSuccess } | null>(null);
  // Respuesta del login que abrió el cambio voluntario: «Más tarde» desde el
  // formulario de cambio sigue con ella (la sesión ya está abierta).
  const [voluntaryFrom, setVoluntaryFrom] = useState<LoginSuccess | null>(null);

  // Destino tras un login correcto (o tras descartar el aviso de caducidad).
  function goToDestination(data: LoginSuccess) {
    const forcedChange = data?.data?.mustChangePassword === true || data?.mustChangePassword === true;
    if (onSuccess) {
      onSuccess(data as { token: string; user: Record<string, unknown> });
    } else if (forcedChange) {
      window.location.href = "/change-password";
    } else {
      window.location.href = safeReturnTo() ?? redirectTo;
    }
  }

  // Login correcto: si la contraseña caduca pronto, primero el aviso; si no (o si
  // hay cambio forzado, que ya cubre la rotación), al destino.
  function finishLogin(data: LoginSuccess) {
    const forcedChange = data?.data?.mustChangePassword === true || data?.mustChangePassword === true;
    const days = data?.data?.passwordExpiresInDays ?? data?.passwordExpiresInDays;
    if (!forcedChange && typeof days === "number" && days > 0) {
      setExpiring({ days, data });
      return;
    }
    goToDestination(data);
  }

  function startVoluntaryChange() {
    setPwMode("change");
    setExpiredCurrent(password);
    setExpiredNew("");
    setExpiredConfirm("");
    setError("");
    setVoluntaryFrom(expiring?.data ?? null);
    setExpiring(null);
    setExpired(true);
  }

  // Core login call, shared by the normal submit and the auto-login that runs
  // right after an expired-password change. Does NOT manage `loading` — callers
  // wrap it so they can also cover their own pre-steps.
  async function performLogin(pwd: string) {
    const res = await fetch(loginEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pwd }),
    });

    const data = await res.json();

    // Invited user — backend resent the activation email. Show the dedicated screen.
    if (res.status === 202 || data.code === "account_pending_activation") {
      setPendingActivation({
        email,
        message: data.message || t("ui.login.pendingActivationDefault"),
      });
      return;
    }

    if (!res.ok) {
      // Alta de notaría sin completar (gate de auth): no es un error que se
      // arregle tecleando otra cosa, así que en vez de un mensaje muerto se
      // lleva al notario a la página de completar el alta. El proxy de login de
      // cada app reenvía este 403 tal cual, de ahí que el código y el enlace
      // vengan en la raíz y no bajo `error`.
      const gateCode = data.code ?? data.error?.code;
      if (gateCode === "REGISTRATION_INCOMPLETE") {
        if (data.completionUrl) {
          window.location.href = data.completionUrl;
          return;
        }
        // Sin enlace = quien entra no es el administrador de la notaría (el
        // enlace de pago solo se le emite a él): se le dice a quién reclamar.
        setError(
          data.adminEmail
            ? t("ui.login.errRegistrationIncompleteAdmin", { email: data.adminEmail })
            : t("ui.login.errRegistrationIncomplete"),
        );
        return;
      }

      // Password expirada: en vez de un error muerto, abrimos el diálogo de
      // cambio (actual + nueva + repetir). La contraseña actual ya la validó el
      // login, así que la pre-rellenamos con la que acaba de teclear.
      if (data.error?.code === "PASSWORD_EXPIRED") {
        setPwMode("expired");
        setExpiredCurrent(pwd);
        setExpiredNew("");
        setExpiredConfirm("");
        setError("");
        setExpired(true);
        return;
      }
      setError(resolveLoginError(t, res.status, data.error?.code, data.error?.message));
      return;
    }

    // Superadmin con segundo factor: falta el código.
    if (data.requiresTotp) {
      setMfaToken(data.mfaToken);
      setTotpCode("");
      setUsarRespaldo(false);
      setUserName(data.user?.displayName || "");
      return;
    }

    // Superadmin with multiple orgs — show selector
    if (data.requiresOrgSelection) {
      setOrgs(data.organizations);
      setSelectToken(data.selectToken);
      setLastOrgId(data.lastOrgId ?? null);
      setUserName(data.user?.displayName || "");
      return;
    }

    // Admin-created-with-initial-password users must rotate before
    // landing on the dashboard (goToDestination → /change-password, cookie
    // already set). Otherwise, the expiring-soon notice if it applies.
    finishLogin(data);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await performLogin(password);
    } catch {
      setError(t("ui.login.errConnection"));
    } finally {
      setLoading(false);
    }
  }

  // Expired-password change: validate client-side (mirrors the backend policy),
  // POST to the expired endpoint, then auto-login with the new password so the
  // normal login proxy issues the session AND runs its per-app provisioning.
  async function handleExpiredSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (expiredNew.length < PASSWORD_MIN_LENGTH) {
      setError(t("ui.setPassword.errMinLength", { min: String(PASSWORD_MIN_LENGTH) }));
      return;
    }
    if (!/[A-Z]/.test(expiredNew) || !/[a-z]/.test(expiredNew) || !/[0-9]/.test(expiredNew)) {
      setError(t("ui.setPassword.errComplexity"));
      return;
    }
    if (expiredNew !== expiredConfirm) {
      setError(t("ui.setPassword.errMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res =
        pwMode === "change"
          ? await fetch(changePasswordEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ currentPassword: expiredCurrent, newPassword: expiredNew }),
            })
          : await fetch(expiredPasswordEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, currentPassword: expiredCurrent, newPassword: expiredNew }),
            });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // El proxy autenticado reenvía el cuerpo de auth tal cual (`{ error:
        // "<msg>", code }`); el de caducada lo normaliza a `{ error: { code, message } }`.
        const code = data.code ?? data.error?.code;
        const message = typeof data.error === "string" ? data.error : data.error?.message;
        setError(resolveLoginError(t, res.status, code, message));
        return;
      }

      // Éxito: entrar directamente con la nueva contraseña. En el cambio con
      // sesión también: auth revoca los refresh tokens al rotar, así que la
      // sesión recién abierta moriría al caducar su access token.
      setPassword(expiredNew);
      setExpired(false);
      setVoluntaryFrom(null);
      await performLogin(expiredNew);
    } catch {
      setError(t("ui.login.errConnection"));
    } finally {
      setLoading(false);
    }
  }

  // Segundo paso: el código va por la MISMA ruta de login de la app (sharedlib lo
  // reenvía a auth /auth/login/totp). La respuesta es la de un login normal.
  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(loginEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken, code: totpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data.error?.code ?? data.code;
        if (code === "MFA_TOKEN_EXPIRED" || code === "MFA_TOKEN_INVALID") {
          handleBackToLogin();
        } else {
          setTotpCode("");
        }
        setError(resolveLoginError(t, res.status, code, data.error?.message));
        return;
      }
      setMfaToken(null);
      setTotpCode("");
      if (data.requiresOrgSelection) {
        setOrgs(data.organizations);
        setSelectToken(data.selectToken);
        setLastOrgId(data.lastOrgId ?? null);
        setUserName(data.user?.displayName || userName);
        return;
      }
      finishLogin(data);
    } catch {
      setError(t("ui.login.errConnection"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOrgSelect(orgId: string) {
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${loginEndpoint}/select-org`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectToken, orgId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || t("ui.login.errSelectOrg"));
        return;
      }

      finishLogin(data);
    } catch {
      setError(t("ui.login.errConnection"));
    } finally {
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    setMfaToken(null);
    setTotpCode("");
    setUsarRespaldo(false);
    setOrgs(null);
    setSelectToken(null);
    setLastOrgId(null);
    setUserName("");
    setPassword("");
    setError("");
  }

  const logoElement = appLogoSvg ? (
    <div
      className="h-12 w-12 shrink-0"
      dangerouslySetInnerHTML={{ __html: appLogoSvg }}
    />
  ) : appLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appLogoUrl} alt={appName} className="h-12 w-12 shrink-0" />
  ) : null;

  const mobileLogoElement = appLogoSvg ? (
    <div
      className="h-9 w-9 shrink-0"
      dangerouslySetInnerHTML={{ __html: appLogoSvg }}
    />
  ) : appLogoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={appLogoUrl} alt={appName} className="h-9 w-9 shrink-0" />
  ) : null;

  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between bg-mc-slate-950 text-white relative overflow-hidden">
        {/* Background photo */}
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-20 pointer-events-none select-none"
          />
        )}
        {/* Gradient overlay to ensure text readability */}
        <div className="absolute inset-0 bg-mc-slate-950/80 pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12">
          <div className="flex items-center gap-4 mb-6">
            {logoElement}
            <h1 className="text-4xl font-bold !text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{appName}</h1>
          </div>
          {subtitle && (
            <p className="text-base text-mc-slate-300 max-w-sm leading-relaxed">{subtitle}</p>
          )}
          <div className={cn("mt-8 h-px w-24", accentClass.replace("text-", "bg-"))} />
          {features && features.length > 0 && (
            <ul className="mt-8 space-y-3">
              {features.map((feat, i) => (
                <li key={i} className="flex items-center gap-3 text-mc-slate-400 text-sm">
                  <svg className={cn("h-5 w-5 shrink-0", accentClass)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feat}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Platform footer */}
        <div className="relative z-10 px-12 py-6 border-t border-white/10">
          <p className="text-xs text-mc-slate-500">
            {t("ui.login.platformPrefix")}{" "}
            <span className="text-mc-slate-400 font-medium">MycoLegal.app</span>
          </p>
          <p className="text-xs text-mc-slate-600 mt-1">
            &copy; {new Date().getFullYear()} MycoLegalTech S.A.
          </p>
          {versionInfo && (
            <p className="text-[10px] text-mc-slate-700 mt-2 font-mono" data-testid="version-info" data-version-platform={versionInfo.platform} data-version-ui={versionInfo.ui} data-version-sharedlib={versionInfo.sharedlib}>
              {versionInfo.platform && <>v{versionInfo.platform}</>}
              {versionInfo.platform && versionInfo.ui && <> · </>}
              {versionInfo.ui && <>ui {versionInfo.ui}</>}
            </p>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 bg-mc-neutral-50 relative">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            {mobileLogoElement}
            <span className="text-xl font-semibold text-mc-slate-900">{appName}</span>
          </div>

          {pendingActivation ? (
            /* ── Account pending activation ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">{t("ui.login.pendingTitle")}</h2>
              <div className="mt-4 rounded-lg bg-mc-primary-50 border border-mc-primary-500/30 px-4 py-3 text-sm text-mc-slate-700">
                {pendingActivation.message}
              </div>
              <p className="mt-4 text-sm text-mc-slate-500">
                {t("ui.login.pendingHintBefore")} <strong>{pendingActivation.email}</strong>{t("ui.login.pendingHintAfter")}
              </p>
              <button
                type="button"
                onClick={() => { setPendingActivation(null); setPassword(""); setError(""); }}
                className="mt-6 text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
              >
                {t("ui.login.backToLogin")}
              </button>
            </>
          ) : mfaToken ? (
            /* ── Segundo factor (superadmin con TOTP) ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">{t("ui.login.totpTitle")}</h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                {usarRespaldo ? t("ui.login.totpBackupIntro") : t("ui.login.totpIntro")}
              </p>

              <form onSubmit={handleTotpSubmit} className="mt-8 space-y-5">
                {error && (
                  <div className="rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700">
                    {error}
                  </div>
                )}
                <div>
                  <label htmlFor="totp" className="block text-sm font-medium text-mc-slate-700">
                    {usarRespaldo ? t("ui.login.totpBackupLabel") : t("ui.login.totpLabel")}
                  </label>
                  {/* `one-time-code` + `numeric`: sin ellos el iPhone no ofrece el código
                      del gestor de contraseñas encima del teclado. */}
                  <input
                    key={usarRespaldo ? "respaldo" : "totp"}
                    id="totp"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                    autoFocus
                    autoComplete={usarRespaldo ? "off" : "one-time-code"}
                    inputMode={usarRespaldo ? "text" : "numeric"}
                    pattern={usarRespaldo ? undefined : "[0-9 ]{6,7}"}
                    maxLength={usarRespaldo ? 12 : 7}
                    placeholder={usarRespaldo ? "XXXX-XXXX" : "123456"}
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 font-mono text-lg tracking-widest text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-mc-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-mc-slate-900 focus:outline-none focus:ring-2 focus:ring-mc-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? t("ui.login.loggingIn") : t("ui.login.totpSubmit")}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => { setUsarRespaldo(!usarRespaldo); setTotpCode(""); setError(""); }}
                  className="text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
                >
                  {usarRespaldo ? t("ui.login.totpUseApp") : t("ui.login.totpUseBackup")}
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
                >
                  {t("ui.login.backToLogin")}
                </button>
              </div>
            </>
          ) : orgs ? (
            /* ── Org selection step ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">{t("ui.login.selectOrgTitle")}</h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                {t("ui.login.selectOrgIntro", { name: userName })}
              </p>

              {error && (
                <div className="mt-4 rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700">
                  {error}
                </div>
              )}

              <div className="mt-6 space-y-2 max-h-80 overflow-y-auto">
                {orgs.map((org) => {
                  const isLast = org.id === lastOrgId;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      disabled={loading}
                      autoFocus={isLast}
                      onClick={() => handleOrgSelect(org.id)}
                      className={`w-full text-left rounded-lg border px-4 py-3 hover:border-mc-primary-400 hover:bg-mc-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        isLast ? "border-mc-primary-500 bg-mc-primary-50 ring-1 ring-mc-primary-500" : "border-mc-neutral-300 bg-white"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-mc-slate-900">{org.name}</span>
                        {isLast && (
                          <span className="shrink-0 text-xs font-medium text-mc-primary-700">{t("ui.login.selectOrgLast")}</span>
                        )}
                      </span>
                      <span className="block text-xs text-mc-slate-400">{org.slug}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleBackToLogin}
                className="mt-4 text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
              >
                {t("ui.login.backToLogin")}
              </button>
            </>
          ) : expiring ? (
            /* ── Password expiring soon (non-blocking notice) ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">{t("ui.login.expiringTitle")}</h2>
              <div
                className="mt-4 rounded-lg bg-mc-warning-50 border border-mc-warning-500/30 px-4 py-3 text-sm text-mc-warning-700"
                data-testid="password-expiring-notice"
              >
                {expiring.days === 1
                  ? t("ui.login.expiringBodyOne")
                  : t("ui.login.expiringBody", { days: String(expiring.days) })}
              </div>
              <p className="mt-4 text-sm text-mc-slate-500">{t("ui.login.expiringHint")}</p>
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={startVoluntaryChange}
                  className="w-full rounded-lg bg-mc-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-mc-slate-900 focus:outline-none focus:ring-2 focus:ring-mc-primary-500 focus:ring-offset-2 transition-colors"
                >
                  {t("ui.login.expiringChangeNow")}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => goToDestination(expiring.data)}
                  className="w-full rounded-lg border border-mc-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-mc-slate-700 shadow-sm hover:bg-mc-neutral-50 focus:outline-none focus:ring-2 focus:ring-mc-primary-500 focus:ring-offset-2 transition-colors"
                >
                  {t("ui.login.expiringLater")}
                </button>
              </div>
            </>
          ) : expired ? (
            /* ── Password change step (expired, or voluntary from the notice) ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">
                {pwMode === "change" ? t("ui.login.changeTitle") : t("ui.login.expiredTitle")}
              </h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                {pwMode === "change" ? t("ui.login.changeSubtitle") : t("ui.login.expiredSubtitle")}
              </p>

              <form onSubmit={handleExpiredSubmit} className="mt-8 space-y-5">
                {error && (
                  <div className="rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="expired-current" className="block text-sm font-medium text-mc-slate-700">
                    {t("ui.login.expiredCurrent")}
                  </label>
                  <PasswordInput
                    id="expired-current"
                    value={expiredCurrent}
                    onChange={(e) => setExpiredCurrent(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <div>
                  <label htmlFor="expired-new" className="block text-sm font-medium text-mc-slate-700">
                    {t("ui.login.expiredNew")}
                  </label>
                  <PasswordInput
                    id="expired-new"
                    value={expiredNew}
                    onChange={(e) => setExpiredNew(e.target.value)}
                    required
                    autoFocus
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                  <p className="mt-1 text-xs text-mc-slate-400">
                    {t("ui.login.expiredHint", { min: String(PASSWORD_MIN_LENGTH) })}
                  </p>
                </div>

                <div>
                  <label htmlFor="expired-confirm" className="block text-sm font-medium text-mc-slate-700">
                    {t("ui.login.expiredConfirm")}
                  </label>
                  <PasswordInput
                    id="expired-confirm"
                    value={expiredConfirm}
                    onChange={(e) => setExpiredConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-mc-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-mc-slate-900 focus:outline-none focus:ring-2 focus:ring-mc-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading
                    ? t("ui.login.loggingIn")
                    : pwMode === "change"
                      ? t("ui.login.changeSubmit")
                      : t("ui.login.expiredSubmit")}
                </button>
              </form>

              {pwMode === "change" && voluntaryFrom ? (
                <button
                  type="button"
                  onClick={() => goToDestination(voluntaryFrom)}
                  className="mt-4 text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
                >
                  {t("ui.login.expiringLater")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setExpired(false); setError(""); setExpiredNew(""); setExpiredConfirm(""); }}
                  className="mt-4 text-sm text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
                >
                  {t("ui.login.backToLogin")}
                </button>
              )}
            </>
          ) : (
            /* ── Login form step ── */
            <>
              <h2 className="text-2xl font-bold text-mc-slate-900">{t("ui.login.title")}</h2>
              <p className="mt-2 text-sm text-mc-slate-500">
                {t("ui.login.subtitle")}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {error && (
                  <div className="rounded-lg bg-mc-error-50 border border-mc-error-500/30 px-4 py-3 text-sm text-mc-error-700">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-mc-slate-700">
                    {t("ui.login.email")}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-mc-slate-700">
                      {t("ui.login.password")}
                    </label>
                    <a
                      href={forgotPasswordUrl}
                      className="text-xs text-mc-slate-500 hover:text-mc-slate-700 transition-colors"
                    >
                      {t("ui.login.forgotPassword")}
                    </a>
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="mt-1 block w-full rounded-lg border border-mc-neutral-300 bg-white px-3 py-2.5 text-mc-slate-900 shadow-sm focus:border-mc-primary-500 focus:outline-none focus:ring-1 focus:ring-mc-primary-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-mc-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-mc-slate-900 focus:outline-none focus:ring-2 focus:ring-mc-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? t("ui.login.loggingIn") : t("ui.login.btnLogin")}
                </button>
              </form>
            </>
          )}
        </div>
        {versionInfo && (
          <p className="absolute bottom-3 left-6 text-[10px] text-mc-slate-400 font-mono lg:hidden" data-testid="version-info-mobile" data-version-platform={versionInfo.platform} data-version-ui={versionInfo.ui} data-version-sharedlib={versionInfo.sharedlib}>
            {versionInfo.platform && <>v{versionInfo.platform}</>}
            {versionInfo.platform && versionInfo.ui && <> · </>}
            {versionInfo.ui && <>ui {versionInfo.ui}</>}
          </p>
        )}
      </div>
    </div>
  );
}
