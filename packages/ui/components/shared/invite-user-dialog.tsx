"use client";

/**
 * Shared invite-user dialog with two creation modes:
 *
 *   1. `email`         → POST {apiBase}/invite           (default)
 *   2. `with_password` → POST {apiBase}/create-with-password
 *
 * Mode 2 is gated by `allowInitialPassword` (default: true). Apps that
 * want only the email flow pass `allowInitialPassword={false}` to hide
 * the radio toggle and the password field.
 *
 * The dialog stays endpoint-agnostic: it builds the form data and hands
 * it to `onSubmit`. The panel inspects `data.initialPassword` to choose
 * the endpoint.
 */

import { useState, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useI18n } from "../i18n/i18n-context";

export interface InviteFormData {
  /** #727 — Autorizar el dominio del correo antes de invitar (solo org_admin). */
  authorizeDomain?: boolean;
  email: string;
  displayName: string;
  phoneNumber?: string;
  appRole?: string;
  language?: string;
  /** When set, the panel hits /create-with-password instead of /invite. */
  initialPassword?: string;
}

export interface RoleOption {
  value: string;
  label: string;
}

export interface LanguageOption {
  value: string;
  label: string;
}

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Devolver `{ ok: false }` deja el formulario intacto para poder reintentar. */
  onSubmit: (data: InviteFormData) => Promise<void | { ok: boolean }>;
  /** Role options. If provided, a role selector is shown. */
  roles?: RoleOption[];
  /** Hint text shown below the role selector */
  roleHint?: string;
  /** Language options. If provided, a language selector is shown (used by admin). */
  languages?: LanguageOption[];
  /** Default language value */
  defaultLanguage?: string;
  /** Email placeholder (e.g. "usuario@dominio.com") */
  emailPlaceholder?: string;
  /** Whether submission is in progress (controlled externally) */
  submitting?: boolean;
  /**
   * #727/#724 — Error del último intento, mostrado DENTRO del diálogo y de
   * forma persistente.
   *
   * Antes el fallo solo salía en un toast de esquina que se borra a los cinco
   * segundos, mientras el usuario mira el formulario. El caso real: un notario
   * intentaba dar de alta a sus empleados, el alta se rechazaba porque el
   * dominio de correo no estaba autorizado, y él concluía que "el email no le
   * llega". El mensaje del servidor era correcto y explicaba dónde ir; sólo que
   * nadie lo veía. 28 notarías se quedaron sin poder incorporar a su equipo.
   */
  error?: string | null;
  /**
   * #727/#724 — Dominio que el servidor rechazó. Si se pasa, se ofrece
   * autorizarlo aquí mismo (`authorizeDomain` en el envío) en vez de mandar al
   * administrador a otra pantalla a mitad de faena. Es el patrón que ya usa el
   * alta por Telegram, que por eso no sufría este problema.
   */
  authorizeDomainOffer?: string | null;
  /**
   * Whether to expose the "create with initial password" mode toggle.
   * Default: true. When false, only the email-invite mode is shown
   * (matches pre-1.45.2 behaviour).
   */
  allowInitialPassword?: boolean;
}

const DEFAULT_LANGUAGES: LanguageOption[] = [
  { value: "CAST", label: "Castellano" },
  { value: "CAT", label: "Catalán" },
  { value: "VAL", label: "Valenciano" },
  { value: "GAL", label: "Gallego" },
  { value: "EUS", label: "Euskera" },
];

type Mode = "email" | "with_password";

const PASSWORD_MIN = 8;

export function InviteUserDialog({
  open,
  onOpenChange,
  onSubmit,
  error,
  authorizeDomainOffer,
  roles,
  roleHint,
  languages,
  defaultLanguage = "CAST",
  emailPlaceholder = "usuario@ejemplo.com",
  submitting = false,
  allowInitialPassword = true,
}: InviteUserDialogProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [appRole, setAppRole] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [authorizeDomain, setAuthorizeDomain] = useState(false);
  const [mode, setMode] = useState<Mode>("email");
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const resetForm = useCallback(() => {
    setEmail("");
    setDisplayName("");
    setPhoneNumber("");
    setAppRole("");
    setLanguage(defaultLanguage);
    setMode("email");
    setInitialPassword("");
    setShowPassword(false);
  }, [defaultLanguage]);

  const passwordTooShort =
    mode === "with_password" && initialPassword.length > 0 && initialPassword.length < PASSWORD_MIN;

  const canSubmit =
    email.length > 0 &&
    displayName.length > 0 &&
    (!roles || appRole.length > 0) &&
    (mode !== "with_password" || initialPassword.length >= PASSWORD_MIN) &&
    !submitting;

  async function handleSubmit() {
    const data: InviteFormData = {
      email,
      displayName,
      ...(authorizeDomainOffer && authorizeDomain ? { authorizeDomain: true } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(roles && appRole ? { appRole } : {}),
      ...(languages ? { language } : {}),
      ...(mode === "with_password" ? { initialPassword } : {}),
    };

    // Sólo se limpia si fue bien: tras un fallo, borrar lo tecleado obliga a
    // reescribirlo todo y refuerza la impresión de que el alta se hizo.
    const res = await onSubmit(data);
    if (!res || res.ok !== false) resetForm();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  const submitLabel = (() => {
    if (submitting) {
      return mode === "with_password"
        ? t("ui.usersAdmin.btnCreatingUser")
        : t("ui.inviteUser.inviting");
    }
    return mode === "with_password"
      ? t("ui.usersAdmin.btnCreateUser")
      : t("ui.inviteUser.btnInvite");
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
       * Es un formulario de captura de datos: un click fuera del modal (o un
       * Escape accidental) NO debe cerrarlo y borrar lo tecleado — se perdía el
       * email/nombre/contraseña a medio escribir (incidencia Notaría Oñate #1).
       * Sólo se cierra con Cancelar, la X o un alta correcta. Prevenir el cierre
       * externo además evita el clásico problema de Radix por el que elegir una
       * opción del <Select> (rol/idioma), que se pinta en un portal, contase como
       * "interacción fuera" y cerrase el diálogo.
       */}
      <DialogContent
        className="sm:max-w-[480px]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("ui.inviteUser.title")}</DialogTitle>
          <DialogDescription>{t("ui.inviteUser.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {allowInitialPassword && (
            <div className="space-y-2">
              <Label>{t("ui.usersAdmin.inviteModeLabel")}</Label>
              <div className="flex flex-col sm:flex-row gap-2 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="invite-mode"
                    value="email"
                    checked={mode === "email"}
                    onChange={() => setMode("email")}
                    disabled={submitting}
                  />
                  {t("ui.usersAdmin.inviteModeEmail")}
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="invite-mode"
                    value="with_password"
                    checked={mode === "with_password"}
                    onChange={() => setMode("with_password")}
                    disabled={submitting}
                  />
                  {t("ui.usersAdmin.inviteModePassword")}
                </label>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="invite-email">{t("ui.login.email")}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={emailPlaceholder}
            />
          </div>

          <div>
            <Label htmlFor="invite-displayName">{t("ui.inviteUser.fullName")}</Label>
            <Input
              id="invite-displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("ui.inviteUser.fullNamePlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="invite-phone">{t("ui.inviteUser.phone")}</Label>
            <Input
              id="invite-phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+34 600 000 000"
            />
          </div>

          {roles && roles.length > 0 && (
            <div>
              <Label htmlFor="invite-role">{t("ui.inviteUser.role")}</Label>
              <Select value={appRole} onValueChange={setAppRole}>
                <SelectTrigger>
                  <SelectValue placeholder={t("ui.inviteUser.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleHint && (
                <p className="text-xs text-muted-foreground mt-1">{roleHint}</p>
              )}
            </div>
          )}

          {languages && (
            <div>
              <Label htmlFor="invite-language">{t("ui.userAccount.fieldLanguage")}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(languages.length > 0 ? languages : DEFAULT_LANGUAGES).map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "with_password" && (
            <div>
              <Label htmlFor="invite-password">{t("ui.usersAdmin.invitePassword")}</Label>
              <div className="relative">
                <Input
                  id="invite-password"
                  type={showPassword ? "text" : "password"}
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder={t("ui.usersAdmin.invitePasswordPlaceholder")}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPassword
                      ? t("ui.usersAdmin.btnHidePassword")
                      : t("ui.usersAdmin.btnShowPassword")
                  }
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("ui.usersAdmin.invitePasswordHint")}
              </p>
              {passwordTooShort && (
                <p className="text-xs text-destructive mt-1">
                  {t("ui.usersAdmin.invitePasswordTooShort")}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <p className="whitespace-pre-wrap">{error}</p>
            {authorizeDomainOffer && (
              <label className="mt-2 flex items-start gap-2 text-xs font-medium text-red-900">
                <input
                  type="checkbox"
                  checked={authorizeDomain}
                  onChange={(e) => setAuthorizeDomain(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-red-300"
                />
                <span>
                  {t("ui.inviteUser.autorizarDominio", { dominio: authorizeDomainOffer })}
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("ui.incidentThread.btnCancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
