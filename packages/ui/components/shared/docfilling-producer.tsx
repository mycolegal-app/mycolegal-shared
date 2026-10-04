"use client";

// `DocFillingProducer` — LA CONVERSACIÓN DE GENERACIÓN, EMBEBIDA (F7.8, D33).
//
// ⚠️ EL PLAN LO LLAMA `DocumentProducer`, Y ESE NOMBRE ESTABA OCUPADO.
//
// `shared/ui` ya exporta un `DocumentProducer` (`document-producer.tsx`, 339
// líneas) que es **otra cosa**: el productor genérico de `document_templates`
// —resolución de plantilla, `fieldsSpec`, modo auto o manual con copia al
// portapapeles— y lo montan DOS consumidores vivos de Tramitación, en actas y
// en expedientes. Fusionar los dos habría metido en un mismo componente dos
// mecanismos que no comparten nada salvo la palabra «documento».
//
// Así que esto se llama `DocFillingProducer`, que además dice de qué viene: del
// `DocFillingModal` al que sustituye.
//
// No es «otra pantalla»: es **la misma** que `/generar/[id]` de DocFilling. F7.8
// lo dice así: «`DocumentProducer` en `shared/ui` ES esta conversación,
// embebida, precargada con lo que el expediente ya sabe». De ahí que viva aquí y
// que DocFilling la monte igual que la montará Notaría: un solo componente con
// dos consumidores es la única forma de que las dos superficies no deriven.
//
// A QUÉ SUSTITUYE, Y QUÉ GANA
//
// Al `DocFillingModal` (942 líneas), que se apoya en el `inter/generate` del SaaS
// en Python —el que «nunca funcionó», dice el plan—. Y deja sin sentido el
// `FaltantesForm` de F4.6: con esto, pedir los datos que faltan y generar son el
// mismo sitio, no dos formularios que se desincronizan.
//
// ⚠️ El modal NO se retira aquí. Está montado en tres sitios vivos
// —`legifirma/actuaciones/[id]`, `notaria/protocolos/[id]` y
// `notaria/expedientes/[id]`— y habla por el canal inter-servicio que **F4**
// todavía no ha reemplazado. Cambiar esos tres consumidores es F4/F12, no F7.8.
//
// LA REGLA QUE GOBIERNA LA PANTALLA: TRES ESTADOS, NO UNA CASILLA
//
// El motor de requisitos es ternario, y «negar la ignorancia no da
// conocimiento». Así que cada pregunta ofrece **Sí / No / No lo sé**:
//
//   · «No»       → el requisito que dependía de ese hecho SE DESCARTA
//   · «No lo sé» → el requisito SIGUE EN DUDA, y sale avisado
//
// Con dos estados, quien no sabe algo marca «no» y ve desaparecer requisitos que
// nadie ha descartado. Ese atajo no se ofrece.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CircleHelp, FileDown, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { AlertBanner } from "./alert-banner";
import { useI18n } from "../i18n/i18n-context";

/** «No lo sé». Es una RESPUESTA y se guarda; no es la ausencia de respuesta. */
export const NO_LO_SE = "NS";

export interface ProducerPregunta {
  fact: string; label: string; tipoDato: string; opciones: string[] | null;
  fuentePreferente: string | null; desbloquea: number; respuesta: string | null;
}
export interface ProducerRequisito {
  codigo: string; descripcion: string | null; tipo: string; momento: string;
  situacion: "firme" | "enDuda" | "descartado";
  documentoCodigo: string | null;
  evidenciaGrupo: { codigo: string; minRequerido: number; documentos: string[] } | null;
  tratamientoInstrumento: string;
  fundamento: { norma: string | null; articulo: string | null; nota: string | null }[];
  comoObtener: string | null; faltan: string[]; sinRevision: boolean;
}
export interface ProducerAportado { aportado: boolean; documentoCodigo?: string; nota?: string }

/**
 * Un dato que se escribe EN el documento.
 *
 * No es un «hecho»: un hecho ternario decide QUÉ requisitos aplican, un campo
 * sale impreso en la escritura. Son 7–10 por documento —medido el 4-oct sobre
 * el esquema de compraventa, que declara 1.699 y pinta 38—, y por eso se pueden
 * teclear. La extracción con IA (F5) los PRECARGA; no los habilita.
 */
export interface ProducerCampo {
  nombre: string; etiqueta: string; tipo: string; opciones: string[];
  instruccion: string | null; quien: string; valor: string | null;
}

/** Lo que devuelve `GET {apiBase}/tareas/{id}`. */
export interface ProducerEstado {
  tarea: {
    id: string; nombre: string; esquemaClave: string; esquemaTitulo: string | null;
    actoCodigo: string | null; estado: string;
    generadoAt: string | null; creditos: number | null;
    documentos: Record<string, ProducerAportado>;
  };
  preguntas: ProducerPregunta[];
  requisitos: ProducerRequisito[];
  documentos: ProducerRequisito[];
  pendientes: number; noSabidas: number; sinRevision: number;
  campos: ProducerCampo[];
  camposPendientes: number;
  /** Condiciones del documento que nadie ha determinado: no se piden, pero
   *  cambian el documento (27.074 caracteres frente a 44.153, medido). */
  condicionesSinDeterminar: number;
}

export interface DocFillingProducerProps {
  /**
   * Prefijo de la API de generación. En DocFilling es su propia ruta; en una app
   * que la embeba, el prefijo que su proxy expone (patrón catch-all de la
   * flota). Se parametriza y no se fija porque es lo único que cambia entre un
   * consumidor y otro.
   */
  apiBase?: string;
  /** Retomar un trabajo existente. Excluyente con `esquemaClave`. */
  tareaId?: string;
  /** Empezar uno nuevo. Requiere `nombre`. */
  esquemaClave?: string;
  nombre?: string;
  /**
   * Lo que el expediente YA SABE: `{ "OBJETO.TIPO": "VIVIENDA" }`. Es la razón
   * de ser de la versión embebida — en Notaría, el tipo de bien ya consta, y
   * volver a preguntarlo sería hacer teclear dos veces el mismo dato.
   */
  hechosIniciales?: Record<string, string>;
  /** Estado inicial, si el anfitrión puede resolverlo en servidor: ahorra el
   *  primer viaje. Sin él, el componente se lo pide a la API. */
  inicial?: ProducerEstado;
  onGenerado?: (r: { markdown: string; parrafos: number; creditos: number }) => void;
  /** Oculta el stepper: útil cuando el anfitrión ya tiene su propia navegación. */
  compacto?: boolean;
}

type Paso = 2 | 3 | 4 | 5;

export function DocFillingProducer({
  apiBase = "/api/generacion", tareaId, esquemaClave, nombre,
  hechosIniciales, inicial, onGenerado, compacto,
}: DocFillingProducerProps) {
  const { t } = useI18n();

  const [id, setId] = useState<string | null>(tareaId ?? null);
  const [estado, setEstado] = useState<ProducerEstado | null>(inicial ?? null);
  const [cargando, setCargando] = useState(!inicial);
  const [paso, setPaso] = useState<Paso>(2);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ markdown: string; parrafos: number; creditos: number } | null>(null);

  const refrescar = useCallback(async (tid: string) => {
    const res = await fetch(`${apiBase}/tareas/${tid}`);
    if (!res.ok) { setError(t("ui.docfillingProducer.noDisponible")); return; }
    const { data } = await res.json();
    setEstado(data as ProducerEstado);
    // El paso no se recuerda en el cliente: lo manda la fila, que es lo que
    // permite retomar el trabajo desde otro navegador.
    setPaso(
      data.tarea.generadoAt ? 5
      : data.tarea.estado === "DOCUMENTOS" ? 3
      : data.tarea.estado === "CAMPOS" ? 4
      : data.tarea.estado === "LISTA" ? 5
      : 2,
    );
  }, [apiBase, t]);

  // Crear (o retomar) una sola vez.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        if (!id && esquemaClave && nombre) {
          const res = await fetch(`${apiBase}/tareas`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, esquemaClave, hechos: hechosIniciales }),
          });
          if (!res.ok) { if (vivo) setError(t("ui.docfillingProducer.noDisponible")); return; }
          const { data } = await res.json();
          if (!vivo) return;
          setId(data.id);
          await refrescar(data.id);
        } else if (id && !inicial) {
          await refrescar(id);
        }
      } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
    // Deliberadamente una sola vez: volver a lanzarlo crearía otra tarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(cuerpo: unknown, marca: string) {
    if (!id) return;
    setGuardando(marca);
    try {
      await fetch(`${apiBase}/tareas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      // Se recarga del servidor en vez de recalcular aquí: una respuesta cambia
      // QUÉ se pregunta y en qué orden, y eso lo decide el motor. Mantener una
      // copia de esa lógica en el navegador es la forma de que discrepen.
      await refrescar(id);
    } finally { setGuardando(null); }
  }

  async function generar() {
    if (!id) return;
    setGenerando(true); setError(null);
    try {
      const res = await fetch(`${apiBase}/tareas/${id}/generar`, { method: "POST" });
      const cuerpo = await res.json();
      if (!res.ok) {
        const code = cuerpo?.error?.code;
        setError(
          code === "SIN_CREDITOS" ? t("ui.docfillingProducer.sinCreditos")
          : code === "PLANTILLA_INCOMPLETA" ? t("ui.docfillingProducer.faltaClausula")
          : code === "CAMPOS_SIN_RELLENAR"
            ? t("ui.docfillingProducer.camposSinRellenar", { d: (cuerpo.error.directivas ?? []).join(", ") })
          // Distinto de lo anterior aunque se parezca: aquí los campos ESTÁN
          // completos y lo que falta es la etapa de concordancia. Decir
          // «faltan valores» mandaría al oficial a buscar un dato que no falta.
          : code === "CONCORDANCIA_PENDIENTE"
            ? t("ui.docfillingProducer.concordanciaPendiente", { n: cuerpo.error.concordancias ?? 0 })
          : (code ?? "ERROR"),
        );
        return;
      }
      setResultado(cuerpo.data);
      onGenerado?.(cuerpo.data);
      await refrescar(id);
    } finally { setGenerando(false); }
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("ui.docfillingProducer.cargando")}
      </div>
    );
  }
  if (!estado) return <AlertBanner type="error" message={error ?? t("ui.docfillingProducer.noDisponible")} />;

  const { tarea } = estado;
  const firmes = estado.requisitos.filter((r) => r.situacion === "firme");
  const enDuda = estado.requisitos.filter((r) => r.situacion === "enDuda");

  return (
    <div className="space-y-4">
      {!compacto && (
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {([
            [2 as Paso, t("ui.docfillingProducer.pasoPreguntas"), "PREGUNTAS"],
            [3 as Paso, t("ui.docfillingProducer.pasoDocumentos"), "DOCUMENTOS"],
            [4 as Paso, t("ui.docfillingProducer.pasoCampos"), "CAMPOS"],
            [5 as Paso, t("ui.docfillingProducer.pasoGenerar"), "LISTA"],
          ] as [Paso, string, string][]).map(([n, label, est]) => (
            <li key={n}>
              <button
                type="button"
                disabled={Boolean(tarea.generadoAt)}
                onClick={() => { setPaso(n); void patch({ estado: est }, `paso-${n}`); }}
                className={`rounded-full px-3 py-1 ${
                  paso === n ? "bg-mc-action-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                } disabled:opacity-60`}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Sin acto no hay requisitos — y eso NO es «no falta nada». */}
      {tarea.actoCodigo === null && (
        <AlertBanner type="warning" message={t("ui.docfillingProducer.sinActo")} />
      )}
      {estado.noSabidas > 0 && (
        <AlertBanner type="info" message={t("ui.docfillingProducer.noSabidasAviso", { n: estado.noSabidas })} />
      )}
      {estado.sinRevision > 0 && (
        <AlertBanner type="warning" message={t("ui.docfillingProducer.sinRevisionAviso", { n: estado.sinRevision })} />
      )}

      {paso === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {t("ui.docfillingProducer.pendientes", { n: estado.pendientes })}
            {estado.noSabidas > 0 && <> · {t("ui.docfillingProducer.noSabidas", { n: estado.noSabidas })}</>}
          </p>
          {estado.preguntas.map((q) => (
            <div key={q.fact} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">{q.label}</span>
                <span className="text-xs tabular-nums text-gray-500">
                  {t("ui.docfillingProducer.desbloquea", { n: q.desbloquea })}
                </span>
              </div>
              {q.fuentePreferente && <p className="mt-0.5 text-xs text-gray-500">{q.fuentePreferente}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {q.opciones && q.opciones.length > 0
                  ? q.opciones.map((o) => (
                      <Opcion key={o} activa={q.respuesta === o} cargando={guardando === q.fact}
                        onClick={() => void patch({ fact: q.fact, valor: o }, q.fact)}>{o}</Opcion>
                    ))
                  : (
                    <>
                      <Opcion activa={q.respuesta === "SI"} cargando={guardando === q.fact}
                        onClick={() => void patch({ fact: q.fact, valor: "SI" }, q.fact)}>{t("ui.docfillingProducer.si")}</Opcion>
                      <Opcion activa={q.respuesta === "NO"} cargando={guardando === q.fact}
                        onClick={() => void patch({ fact: q.fact, valor: "NO" }, q.fact)}>{t("ui.docfillingProducer.no")}</Opcion>
                    </>
                  )}
                {/* En los DOS casos: la ignorancia es posible con cualquier tipo de dato. */}
                <Opcion activa={q.respuesta === NO_LO_SE} cargando={guardando === q.fact} tono="duda"
                  onClick={() => void patch({ fact: q.fact, valor: NO_LO_SE }, q.fact)}>
                  <CircleHelp className="mr-1 inline h-3.5 w-3.5" />
                  {t("ui.docfillingProducer.noLoSe")}
                </Opcion>
                {q.respuesta !== null && (
                  <button type="button" className="text-xs text-gray-500 underline"
                    onClick={() => void patch({ fact: q.fact, valor: null }, q.fact)}>
                    {t("ui.docfillingProducer.borrarRespuesta")}
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button onClick={() => { setPaso(3); void patch({ estado: "DOCUMENTOS" }, "paso-3"); }}>
            {t("ui.docfillingProducer.siguiente")}
          </Button>
        </div>
      )}

      {paso === 3 && (
        <div className="space-y-3">
          {estado.documentos.map((r) => {
            const a = tarea.documentos[r.codigo];
            return (
              <div key={r.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-gray-900">{r.descripcion ?? r.codigo}</span>
                  <Pastilla situacion={r.situacion} texto={t(`ui.docfillingProducer.situacion_${r.situacion}`)} />
                  {r.sinRevision && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                </div>
                {r.situacion === "enDuda" && r.faltan.length > 0 && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t("ui.docfillingProducer.porque", { hechos: r.faltan.join(", ") })}
                  </p>
                )}
                {/* «Vale cualquiera de estos tres»: pedir los tres sería hacer
                    trabajar al oficial de más. */}
                {r.evidenciaGrupo ? (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600">
                      {t("ui.docfillingProducer.valeCualquiera", {
                        n: r.evidenciaGrupo.documentos.length, min: r.evidenciaGrupo.minRequerido,
                      })}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {r.evidenciaGrupo.documentos.map((d) => (
                        <Opcion key={d} activa={a?.documentoCodigo === d} cargando={guardando === r.codigo}
                          onClick={() => void patch({ requisito: r.codigo, documento: { aportado: true, documentoCodigo: d } }, r.codigo)}>
                          {d}
                        </Opcion>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Opcion activa={Boolean(a?.aportado)} cargando={guardando === r.codigo}
                      onClick={() => void patch({
                        requisito: r.codigo,
                        documento: a?.aportado ? null : { aportado: true, documentoCodigo: r.documentoCodigo ?? undefined },
                      }, r.codigo)}>
                      <Check className="mr-1 inline h-3.5 w-3.5" />
                      {t("ui.docfillingProducer.aportado")}
                    </Opcion>
                  </div>
                )}
                {r.comoObtener && <p className="mt-2 text-xs text-gray-500">{r.comoObtener}</p>}
              </div>
            );
          })}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setPaso(2); void patch({ estado: "PREGUNTAS" }, "paso-2"); }}>
              {t("ui.docfillingProducer.atras")}
            </Button>
            <Button onClick={() => { setPaso(4); void patch({ estado: "CAMPOS" }, "paso-4"); }}>
              {t("ui.docfillingProducer.siguiente")}
            </Button>
          </div>
        </div>
      )}

      {/* ── PASO 4: los campos del documento ──────────────────────────────
          Es lo que D33 asignó a esta superficie: «deja sin sentido
          `FaltantesForm`». Pedir los datos que faltan y generar, en el mismo
          sitio, en vez de dos formularios que se desincronizan.

          Y es viable porque son POCOS: 7–10 por documento. El esquema declara
          1.699 campos, pero el motor resuelve unos, otros sólo gobiernan un
          `{{IF}}` y la mayoría viven en ramas que este documento no toma. */}
      {paso === 4 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {t("ui.docfillingProducer.camposPendientes", { n: estado.camposPendientes })}
          </p>

          {/* Las condiciones que nadie ha determinado NO se piden —sólo
              gobiernan un IF— pero cambian el documento: con ellas vacías se
              toma la rama mínima. Un documento más corto de lo que debería no
              se nota leyéndolo, así que se dice. */}
          {estado.condicionesSinDeterminar > 0 && (
            <AlertBanner
              type="info"
              message={t("ui.docfillingProducer.condicionesAviso", { n: estado.condicionesSinDeterminar })}
            />
          )}

          {estado.campos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600">
              {t("ui.docfillingProducer.sinCampos")}
            </p>
          ) : estado.campos.map((c) => (
            <div key={c.nombre} className="rounded-lg border border-gray-200 bg-white p-3">
              <label className="block text-sm font-medium text-gray-900" htmlFor={`campo-${c.nombre}`}>
                {c.etiqueta}
              </label>
              {c.instruccion && <p className="mt-0.5 text-xs text-gray-500">{c.instruccion}</p>}
              <CampoEntrada
                campo={c}
                guardando={guardando === c.nombre}
                onGuardar={(v) => void patch({ campo: c.nombre, valor: v }, c.nombre)}
              />
            </div>
          ))}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setPaso(3); void patch({ estado: "DOCUMENTOS" }, "paso-3"); }}>
              {t("ui.docfillingProducer.atras")}
            </Button>
            <Button onClick={() => { setPaso(5); void patch({ estado: "LISTA" }, "paso-5"); }}>
              {t("ui.docfillingProducer.siguiente")}
            </Button>
          </div>
        </div>
      )}

      {paso === 5 && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-700">
              <strong className="tabular-nums">{firmes.length}</strong> {t("ui.docfillingProducer.situacion_firme")} ·{" "}
              <strong className="tabular-nums">{enDuda.length}</strong> {t("ui.docfillingProducer.situacion_enDuda")}
            </p>
            {estado.camposPendientes > 0 && !tarea.generadoAt && (
              <p className="mt-2 text-sm text-amber-700">
                {t("ui.docfillingProducer.camposPendientes", { n: estado.camposPendientes })}
              </p>
            )}
            {tarea.generadoAt ? (
              <p className="mt-2 text-sm text-gray-600">
                {t("ui.docfillingProducer.generada", {
                  fecha: new Date(tarea.generadoAt).toLocaleString(), creditos: tarea.creditos ?? 0,
                })}
              </p>
            ) : (
              <>
                <p className="mt-2 text-xs text-gray-500">{t("ui.docfillingProducer.coste")}</p>
                <Button className="mt-3 gap-2" disabled={generando} onClick={() => void generar()}>
                  <FileDown className="h-4 w-4" />
                  {generando ? t("ui.docfillingProducer.generando") : t("ui.docfillingProducer.generar")}
                </Button>
              </>
            )}
          </div>
          {error && <AlertBanner type="error" message={error} />}
          {resultado && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-700">
                {t("ui.docfillingProducer.parrafosCompuestos", { n: resultado.parrafos })}
              </p>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">
                {resultado.markdown}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Opcion({ activa, cargando, onClick, children, tono }: {
  activa: boolean; cargando: boolean; onClick: () => void;
  children: React.ReactNode; tono?: "duda";
}) {
  // El «no lo sé» se distingue en COLOR: es una respuesta legítima, no un
  // descarte, y verla igual que «No» invitaría a confundirlas.
  const base = activa
    ? tono === "duda" ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-mc-action-600 text-white"
    : "bg-gray-100 text-gray-700 hover:bg-gray-200";
  return (
    <button type="button" onClick={onClick} disabled={cargando}
      className={`rounded-full px-3 py-1 text-xs ${base} disabled:opacity-50`}>
      {children}
    </button>
  );
}

function Pastilla({ situacion, texto }: { situacion: ProducerRequisito["situacion"]; texto: string }) {
  const color = situacion === "firme" ? "bg-emerald-100 text-emerald-800"
    : situacion === "enDuda" ? "bg-amber-100 text-amber-800"
    : "bg-gray-100 text-gray-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${color}`}>{texto}</span>;
}

/**
 * La entrada de un campo, según su tipo canónico.
 *
 * Se guarda al salir del foco (`onBlur`) y no en cada tecla: cada guardado
 * recalcula en el servidor QUÉ campos hacen falta —los condicionales abren y
 * cierran ramas— y hacerlo por pulsación sería una consulta por letra.
 */
function CampoEntrada({ campo, guardando, onGuardar }: {
  campo: ProducerCampo; guardando: boolean; onGuardar: (v: string) => void;
}) {
  const [v, setV] = useState(campo.valor ?? "");
  // Si el servidor trae otro valor —otra pestaña, una precarga— gana el servidor.
  useEffect(() => { setV(campo.valor ?? ""); }, [campo.valor]);

  const comun = "mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50";
  const guardar = () => { if (v !== (campo.valor ?? "")) onGuardar(v); };

  if (campo.opciones.length > 0) {
    return (
      <select id={`campo-${campo.nombre}`} className={comun} value={v} disabled={guardando}
        onChange={(e) => { setV(e.target.value); onGuardar(e.target.value); }}>
        <option value="">—</option>
        {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (campo.tipo === "BOOL") {
    return (
      <select id={`campo-${campo.nombre}`} className={comun} value={v} disabled={guardando}
        onChange={(e) => { setV(e.target.value); onGuardar(e.target.value); }}>
        <option value="">—</option>
        <option value="SI">SI</option>
        <option value="NO">NO</option>
      </select>
    );
  }
  return (
    <input
      id={`campo-${campo.nombre}`}
      className={comun}
      type={campo.tipo === "DATE" ? "date" : campo.tipo === "NUM" ? "number" : "text"}
      value={v}
      disabled={guardando}
      onChange={(e) => setV(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } }}
    />
  );
}
