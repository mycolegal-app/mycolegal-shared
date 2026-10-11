"use client";

// «GENERAR CON REDACTOR» EN LA FICHA DE LA APP DE ORIGEN (DR16/DR21, F11.3–F11.5 de Redactor).
//
// Lo mismo en Notaría (expediente), LegiFirma (actuación) y Pólizas (póliza): el botón que encarga
// el documento, la lista de lo que Redactor ha hecho para esa entidad —con su estado y si ya está
// incorporado— y el modal de generación para seguirlo o reabrirlo. Cada app sólo da:
//   · `encargoUrl`: SU ruta que arma el encargo (lo que ella sabe) y dónde se incorpora;
//   · `entidad`: la que lista las tareas en Redactor (app + tipo + id).
import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { useI18n } from "../i18n/i18n-context";
import { GeneracionRedactorModal, type EncargoRedactor, type DestinoIncorporar } from "./generacion-redactor-modal";

interface DocumentoRedactor {
  tareaId: string;
  nombre: string;
  referencia: string | null;
  estado: "trabajando" | "preguntas" | "listo" | "error" | null;
  generadoAt: string | null;
  incorporado: boolean;
}

export interface GenerarConRedactorProps {
  /** `GET` → `{ data: { encargo, incorporarEn } }` (o un error con `error.message`). */
  encargoUrl: string;
  entidad: { app: string; tipo: string; id: string };
  /** La ruta estrecha de la app hacia Redactor. */
  apiBase?: string;
  /** Título del modal. */
  titulo?: string;
  /** Texto del botón; por defecto «Generar con Redactor». */
  etiqueta?: string;
  /** Sin botón (sólo la lista), p. ej. sin permiso de escritura. */
  soloLista?: boolean;
  className?: string;
}

export function GenerarConRedactor({
  encargoUrl, entidad, apiBase = "/api/redactor", titulo, etiqueta, soloLista, className,
}: GenerarConRedactorProps) {
  const { t } = useI18n();
  const [modal, setModal] = useState<{ encargo?: EncargoRedactor; tareaId?: string } | null>(null);
  const [destino, setDestino] = useState<DestinoIncorporar | undefined>(undefined);
  const [docs, setDocs] = useState<DocumentoRedactor[]>([]);
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Por sus VALORES, no por el objeto: la app lo crea en cada render y sería un bucle de peticiones.
  const { app, tipo, id } = entidad;
  const cargarDocs = useCallback(async () => {
    const qs = new URLSearchParams({ app, tipo, id }).toString();
    const r = await fetch(`${apiBase}/tareas?${qs}`).catch(() => null);
    if (r?.ok) setDocs(((await r.json()).data ?? []) as DocumentoRedactor[]);
  }, [apiBase, app, tipo, id]);
  useEffect(() => { void cargarDocs(); }, [cargarDocs]);

  // El encargo lo arma el servidor de la app (con lo que sabe) y el modal se lo manda a Redactor.
  const pedirEncargo = useCallback(async () => {
    const r = await fetch(encargoUrl).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok || !j?.data?.encargo) throw new Error(j?.error?.message ?? t("ui.generacionRedactor.noDisponible"));
    setDestino(j.data.incorporarEn);
    return j.data.encargo as EncargoRedactor;
  }, [encargoUrl, t]);

  async function generar() {
    setPidiendo(true);
    setError(null);
    try {
      setModal({ encargo: await pedirEncargo() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPidiendo(false);
    }
  }

  async function abrir(tareaId: string) {
    // Para «Incorporar» hace falta el destino, que viene con el encargo.
    if (!destino) await pedirEncargo().catch(() => null);
    setModal({ tareaId });
  }

  return (
    <div className={className}>
      {!soloLista && (
        <Button size="sm" disabled={pidiendo} onClick={() => void generar()}>
          {pidiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          <span className="ml-1.5">{etiqueta ?? t("ui.generacionRedactor.boton")}</span>
        </Button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {docs.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-gray-600">{t("ui.generacionRedactor.documentos")}</p>
          <ul className="divide-y rounded-md border">
            {docs.map((d) => (
              <li key={d.tareaId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-gray-800">
                  {d.nombre}
                  {d.referencia && <span className="ml-2 text-gray-400">{d.referencia}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">
                    {d.estado ? t(`ui.generacionRedactor.estado.${d.estado}`) : ""}
                    {d.generadoAt && ` · ${new Date(d.generadoAt).toLocaleDateString()}`}
                    {d.incorporado && ` · ${t("ui.generacionRedactor.incorporadoMin")}`}
                  </span>
                  <button type="button" onClick={() => void abrir(d.tareaId)} className="rounded border px-2 py-0.5 text-gray-700 hover:bg-gray-50">
                    {t("ui.generacionRedactor.abrir")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modal && (
        <GeneracionRedactorModal
          abierto
          onCerrar={() => { setModal(null); void cargarDocs(); }}
          apiBase={apiBase}
          encargo={modal.encargo}
          tareaId={modal.tareaId}
          titulo={titulo}
          incorporarEn={destino}
          onIncorporado={() => void cargarDocs()}
          onCambio={() => void cargarDocs()}
        />
      )}
    </div>
  );
}
