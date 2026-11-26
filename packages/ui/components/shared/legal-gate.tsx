"use client";

/**
 * Pantalla bloqueante de re-aceptación de términos. Mientras el usuario tenga
 * documentos legales vigentes sin aceptar (condiciones, privacidad, DPA…), se
 * superpone a toda la app y exige aceptarlos antes de continuar.
 *
 * La monta el AppShell compartido en todas las apps de usuario. Es fail-safe:
 * si `/api/legal/pending` no existe (404) o falla, no bloquea (no hay nada que
 * aceptar). El backend exime a los superadmins.
 *
 * 25-nov-2026 — Las condiciones de la NOTARÍA (PLATFORM_TOS, DPA) sólo las acepta
 * el org_admin. Al resto de usuarios auth no se las devuelve en `pending` sino en
 * `pendingAdmin` (sin texto): no bloquean, y se pinta un aviso discreto de que su
 * administrador las tiene pendientes. La privacidad la sigue aceptando cada uno.
 * Pasados 30 días desde su entrada en vigor (`bloquea`), si el administrador sigue
 * sin aceptarlas, también se bloquea al usuario, con una ventana SIN botón de
 * aceptar: sólo puede hacerlo el administrador.
 *
 * Requiere que la app exponga el proxy `/api/legal/*` hacia auth
 * (`/legal/pending`, `/legal/accept`) — ver `proxyToAuth` de
 * `@mycolegal-app/ui/server/auth-proxy`.
 */

import { useEffect, useState } from "react";
import { marked } from "marked";
import { useI18n } from "../i18n/i18n-context";
import { pedirConCacheDeSesion } from "../../lib/cache-sesion";

interface PendingDoc {
  id: string;
  kind: string;
  title: string;
  body: string;
  version: string;
  language: string;
}

interface PendingAdminDoc {
  kind: string;
  title: string;
  version: string;
  /** Fin del plazo del administrador (ISO). */
  plazoHasta?: string;
  /** Plazo vencido: también bloquea al usuario. */
  bloquea?: boolean;
}

// Solo se guarda (10 min, sessionStorage) el «nada pendiente»: un documento por
// aceptar se pide siempre de nuevo, y tras aceptar se fuerza la red. Lo que tiene
// pendiente el administrador sí viaja en lo guardado: si lo acepta, el aviso puede
// tardar hasta 10 min en irse, y a cambio no se pide en cada página.
async function fetchPending(forzar = false): Promise<{ pending: PendingDoc[]; pendingAdmin: PendingAdminDoc[] }> {
  const r = await pedirConCacheDeSesion<{ pending?: PendingDoc[]; pendingAdmin?: PendingAdminDoc[] }>("/api/legal/pending", {
    vidaMs: 10 * 60_000,
    forzar,
    // Un bloqueo por plazo vencido no se guarda: en cuanto el administrador acepte, se tiene que levantar.
    guardarSi: (json) =>
      (!Array.isArray(json?.pending) || json.pending.length === 0) &&
      !(Array.isArray(json?.pendingAdmin) && json.pendingAdmin.some((d) => d.bloquea)),
  });
  if (!r.ok) return { pending: [], pendingAdmin: [] };
  return {
    pending: Array.isArray(r.json?.pending) ? r.json.pending : [],
    pendingAdmin: Array.isArray(r.json?.pendingAdmin) ? r.json.pendingAdmin : [],
  };
}

/** Plazo vencido y el administrador sin aceptar: el usuario no puede seguir, ni aceptar él. */
function BloqueoAdminPendiente({ docs }: { docs: PendingAdminDoc[] }) {
  const { t } = useI18n();
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 print:hidden"
    >
      <div className="w-full max-w-lg space-y-3 rounded-2xl bg-white px-6 py-5 shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900">{t("ui.legal.adminBlockTitle")}</h2>
        <p className="text-sm text-gray-600">{t("ui.legal.adminBlockBody")}</p>
        <p className="text-sm font-medium text-gray-800">{docs.map((d) => d.title).join(" · ")}</p>
      </div>
    </div>
  );
}

const CLAVE_AVISO_CERRADO = "mc:legal:avisoAdminCerrado";

/** Aviso discreto para quien no es administrador: no bloquea y se puede cerrar (hasta la próxima sesión). */
function AvisoAdminPendiente({ docs }: { docs: PendingAdminDoc[] }) {
  const { t } = useI18n();
  const firma = docs.map((d) => `${d.kind}@${d.version}`).join("|");
  const [cerrado, setCerrado] = useState(() => {
    try {
      return sessionStorage.getItem(CLAVE_AVISO_CERRADO) === firma;
    } catch {
      return false;
    }
  });
  if (cerrado) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[110] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg print:hidden"
    >
      <span className="flex-1">
        {t("ui.legal.adminPendingNotice")}{" "}
        <span className="font-medium">{docs.map((d) => d.title).join(" · ")}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(CLAVE_AVISO_CERRADO, firma);
          } catch {
            /* sin sessionStorage se cierra sólo en esta página */
          }
          setCerrado(true);
        }}
        aria-label={t("ui.legal.adminPendingDismiss")}
        className="shrink-0 text-amber-700 hover:text-amber-900"
      >
        ×
      </button>
    </div>
  );
}

export function LegalGate() {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingDoc[] | null>(null);
  const [pendingAdmin, setPendingAdmin] = useState<PendingAdminDoc[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPending().then((r) => {
      setPending(r.pending);
      setPendingAdmin(r.pendingAdmin);
    });
  }, []);

  // null = aún cargando; [] = nada pendiente. En ambos casos no hay ventana; como mucho, el aviso del administrador.
  if (!pending) return null;
  const vencidos = pendingAdmin.filter((d) => d.bloquea);
  // La privacidad propia se acepta primero (su ventana sale antes); después, si toca, el bloqueo del administrador.
  if (pending.length === 0) {
    if (vencidos.length) return <BloqueoAdminPendiente docs={vencidos} />;
    return pendingAdmin.length ? <AvisoAdminPendiente docs={pendingAdmin} /> : null;
  }

  async function acceptAll() {
    setBusy(true);
    setError(null);
    try {
      for (const doc of pending!) {
        const res = await fetch("/api/legal/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id }),
        });
        if (!res.ok) {
          setError(t("ui.legal.gateError"));
          return;
        }
      }
      const { pending: next } = await fetchPending(true);
      setChecked(false);
      if (next.length === 0) {
        // Recargamos para que el estado de la app refleje el acceso ya concedido.
        window.location.reload();
      } else {
        setPending(next);
      }
    } catch {
      setError(t("ui.legal.gateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 print:hidden"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{t("ui.legal.gateTitle")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("ui.legal.gateIntro")}</p>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-5">
          {pending.map((doc) => (
            <section key={doc.id}>
              <div
                className="legal-prose"
                dangerouslySetInnerHTML={{ __html: marked.parse(doc.body || "") as string }}
              />
            </section>
          ))}
        </div>

        <div className="shrink-0 space-y-3 border-t border-gray-200 px-6 py-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <label className="flex items-start gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{t("ui.legal.gateAcceptLabel")}</span>
          </label>
          <button
            type="button"
            disabled={!checked || busy}
            onClick={acceptAll}
            className="w-full rounded-lg bg-navy-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("ui.legal.gateSubmitting") : t("ui.legal.gateContinue")}
          </button>
        </div>
      </div>
    </div>
  );
}
