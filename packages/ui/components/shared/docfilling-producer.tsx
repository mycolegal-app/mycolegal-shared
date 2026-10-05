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
import { AlertTriangle, Check, CircleHelp, FileDown, FileText, Link2, Loader2, Sparkles, Upload } from "lucide-react";
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
/** Un notario de la organización, para el selector de firma. */
export interface ProducerNotario { authUserId: string; nombre: string }

/**
 * Quién firma la escritura.
 *
 * Es una propiedad de la ESCRITURA, no de la organización: en un despacho con
 * varios titulares cada documento lo firma uno, así que se elige aquí y se
 * guarda en la tarea. Con un solo notario viene derivado, y aun así **se
 * enseña** — porque el rol NOTARIO se usa también para administrar, y un
 * «Ante mí, SuperAdmin» tiene que verse mirando la pantalla y no leyendo la
 * escritura ya firmada.
 *
 * `usa: false` cuando el documento no nombra al notario, y entonces no se
 * pregunta: de los 1.720 ficheros de la biblioteca sólo 13 lo nombran.
 */
export interface ProducerFirma {
  usa: boolean;
  valor: string | null;
  origen: "configurado" | "derivado" | "falta" | "elegir" | "elegido";
  opciones: ProducerNotario[];
  fuente?: string;
}

export interface ProducerCampo {
  nombre: string; etiqueta: string; tipo: string; opciones: string[];
  instruccion: string | null; quien: string; valor: string | null;
  /** Participa en un `{{IF}}`: contestarlo reescribe el documento. Van primero. */
  gobierna: boolean;
  nivel: number;
  porque?: string;
}

/**
 * Un fichero ya aportado a un requisito.
 *
 * `caracteres` es lo que de verdad importa de cada uno: un PDF escaneado del que
 * no se pudo leer texto **no le sirve a la IA**, y el oficial tiene que poder
 * verlo antes de contar con que el dato va a salir de ahí.
 */
export interface ProducerAdjunto {
  id: string;
  /** Apunta a un fichero del expediente: es un ENLACE, no una subida. Se dice
   *  en pantalla porque quitarlo no hace lo mismo. */
  origenNodeId?: string | null;
  requisitoCodigo: string;
  documentoCodigo: string | null;
  nombre: string;
  tamanoBytes: number;
  caracteres: number;
  textoError: string | null;
}

/**
 * Lo que la IA propone para un campo. **Propuesta, no valor**: hasta que una
 * persona la acepta no entra en el documento, y por eso cada una trae su
 * `fuente` — sin saber de dónde sale un dato, aceptarlo es firmar a ciegas.
 */
export interface ProducerPropuesta {
  campo: string;
  etiqueta: string;
  valor: string;
  confianza: "alta" | "media" | "baja";
  fuente: string;
  porque: string;
}

/**
 * Un documento del expediente que se puede ENLAZAR en vez de volver a subirlo
 * (F5.15). `conTexto` importa: si ya está extraído, enlazarlo es instantáneo; si
 * no, hay que leerlo al enlazar y eso tarda.
 */
export interface ProducerCandidato {
  nodeId: string;
  nombre: string;
  mime: string | null;
  tamanoBytes: number;
  conTexto: boolean;
}

/** Lo que devuelve `GET {apiBase}/tareas/{id}`. */
export interface ProducerEstado {
  tarea: {
    id: string; nombre: string; esquemaClave: string; esquemaTitulo: string | null;
    actoCodigo: string | null; estado: string;
    generadoAt: string | null; creditos: number | null;
    documentos: Record<string, ProducerAportado>;
    /** El expediente o la actuación de donde viene. Es lo que permite ofrecer
     *  sus documentos para enlazarlos (F5.15). */
    entidad?: { app: string; tipo: string; id: string; etiqueta: string | null } | null;
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
  gobernantesPendientes: number;
  firma: ProducerFirma;
  /** Los ficheros aportados, con su requisito. Puede faltar: una app anfitriona
   *  con una versión anterior del endpoint no lo manda, y la pantalla tiene que
   *  seguir funcionando sin la parte de adjuntos. */
  adjuntos?: ProducerAdjunto[];
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
  // Subida y lectura con IA. Van en estado propio y no en `guardando` porque
  // tardan lo suyo —una subida extrae texto, la lectura llama a un modelo— y
  // bloquear la pantalla entera mientras tanto impediría seguir rellenando.
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [extrayendo, setExtrayendo] = useState(false);
  const [ia, setIa] = useState<{
    propuestas: ProducerPropuesta[];
    sinDatos: { campo: string; porque: string }[];
    pedidos: number;
    contexto: { adjuntos: number; conTexto: number };
    /** Campos que siguen sin valor en la tarea. Es lo que distingue «ya está
     *  todo» de «la IA no puede seguir y te toca a ti». */
    pendientes: number;
  } | null>(null);
  const [iaError, setIaError] = useState<string | null>(null);
  // ── EL BUCLE DE LECTURA, Y SU RELATO ─────────────────────────────────────
  //
  // Una sola pasada no basta: aceptar una condición **reescribe el documento** y
  // aparecen campos nuevos. Medido en una segregación: 85 campos → 98 → 94 → 41
  // → 32 → 28, con la frontera bajando del nivel 0 al 5 y 23 campos todavía
  // pendientes tras seis vueltas.
  //
  // Con esos números, lo que no se puede hacer es dejar un reloj girando: hay
  // que CONTAR lo que está pasando. De ahí que se guarde el historial de pasadas
  // y los segundos de la que está en curso, y que el texto diga cuántos
  // documentos lee y por cuántos campos pregunta — no «cargando».
  const [iaPasadas, setIaPasadas] = useState<
    { n: number; pedidos: number; propuestas: number; sinDatos: number; segundos: number }[]
  >([]);
  const [iaEnCurso, setIaEnCurso] = useState<
    { n: number; docs: number; caracteres: number; campos: number; desde: number } | null
  >(null);
  const [iaSegundos, setIaSegundos] = useState(0);
  /** Lo ya preguntado. Es lo que hace que el bucle TERMINE: un campo que nadie
   *  puede resolver no se vuelve a pedir en la vuelta siguiente. */
  const [iaPreguntados, setIaPreguntados] = useState<string[]>([]);
  const [iaAplicando, setIaAplicando] = useState<{ hecho: number; total: number } | null>(null);
  const [iaFin, setIaFin] = useState<"sinCampos" | "sinPropuestas" | "tope" | "teToca" | null>(null);
  const [iaAceptados, setIaAceptados] = useState(0);
  // Los documentos del expediente que se pueden enlazar. `null` = aún no se han
  // pedido; `[]` = se pidieron y no hay. La distinción evita enseñar «no hay
  // documentos» mientras todavía se están cargando.
  const [candidatos, setCandidatos] = useState<ProducerCandidato[] | null>(null);
  const [enlazando, setEnlazando] = useState<string | null>(null);

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

  /**
   * Adjunta un fichero a un requisito.
   *
   * `multipart` y no base64 en un JSON: un escaneado puede pesar varios MB y
   * base64 lo infla un tercio para nada.
   */
  async function adjuntar(requisito: string, documento: string | null, fichero: File) {
    if (!id) return;
    setSubiendo(requisito); setError(null);
    try {
      const fd = new FormData();
      fd.append("fichero", fichero);
      fd.append("requisito", requisito);
      if (documento) fd.append("documento", documento);
      const res = await fetch(`${apiBase}/tareas/${id}/adjuntos`, { method: "POST", body: fd });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setError(cuerpo?.error?.code === "DEMASIADO_GRANDE"
          ? t("ui.docfillingProducer.adjuntoGrande")
          : t("ui.docfillingProducer.adjuntoFallo"));
        return;
      }
      // Adjuntar marca el requisito como aportado: la casilla y el fichero son
      // la misma afirmación, y dejarlas separadas permitiría un requisito con
      // su documento dentro y sin marcar.
      await fetch(`${apiBase}/tareas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisito, documento: { aportado: true, documentoCodigo: documento ?? undefined } }),
      });
      await refrescar(id);
    } finally { setSubiendo(null); }
  }

  async function quitarAdjunto(requisito: string, adjuntoId: string) {
    if (!id) return;
    setSubiendo(requisito);
    try {
      // ⚠️ El parámetro se llama `adjunto`, no `id`: `id` es el de la TAREA y ya
      // va en la ruta. Con `id=` la ruta contesta 400 y el adjunto se queda.
      await fetch(`${apiBase}/tareas/${id}/adjuntos?adjunto=${encodeURIComponent(adjuntoId)}`, { method: "DELETE" });
      await Promise.all([refrescar(id), cargarCandidatos(id)]);
    } finally { setSubiendo(null); }
  }

  // El contador de segundos de la pasada en curso. Es la diferencia entre «está
  // pensando» y «se ha colgado»: sin un número que sube, a los veinte segundos
  // cualquiera recarga la página.
  useEffect(() => {
    if (!iaEnCurso) { setIaSegundos(0); return; }
    const t = setInterval(() => setIaSegundos(Math.round((Date.now() - iaEnCurso.desde) / 1000)), 1000);
    return () => clearInterval(t);
  }, [iaEnCurso]);

  /**
   * Los documentos del expediente de origen.
   *
   * No hace falta que la app anfitriona los pase: la tarea guarda de qué
   * expediente viene y la Unidad de Red sabe qué ficheros cuelgan de él. Sin
   * expediente la lista sale vacía, y eso no es un error.
   */
  const cargarCandidatos = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`${apiBase}/tareas/${tid}/adjuntos/enlazar`);
      if (!res.ok) { setCandidatos([]); return; }
      const { data } = await res.json();
      setCandidatos(data.candidatos ?? []);
    } catch { setCandidatos([]); }
  }, [apiBase]);

  /**
   * Enlazar un documento del expediente a un requisito (F5.15).
   *
   * **No lo copia ni lo vuelve a subir**: cuelga un `ln -s` en la carpeta del
   * caso. El fichero sigue siendo uno, así que si Notaría lo corrige, aquí se ve
   * corregido — y no se facturan los bytes dos veces.
   */
  async function enlazar(requisito: string, documento: string | null, nodeId: string) {
    if (!id) return;
    setEnlazando(requisito); setError(null);
    try {
      const res = await fetch(`${apiBase}/tareas/${id}/adjuntos/enlazar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, requisito, documento }),
      });
      if (!res.ok) { setError(t("ui.docfillingProducer.enlaceFallo")); return; }
      await fetch(`${apiBase}/tareas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisito, documento: { aportado: true, documentoCodigo: documento ?? undefined } }),
      });
      await Promise.all([refrescar(id), cargarCandidatos(id)]);
    } finally { setEnlazando(null); }
  }

  // Los candidatos se piden al entrar en el paso de documentos y no al arrancar:
  // en una tarea que no llega a ese paso sería un viaje para nada.
  useEffect(() => {
    if (paso === 3 && id && candidatos === null) void cargarCandidatos(id);
  }, [paso, id, candidatos, cargarCandidatos]);

  /** Tope de vueltas. No es un número mágico: medido, la frontera de una
   *  segregación llega al nivel 5, así que seis cubre el caso real y evita que
   *  un esquema raro encadene llamadas sin fin. Al llegar se PARA y se dice. */
  const TOPE_PASADAS = 6;

  /**
   * Una pasada de lectura. Devuelve si tiene sentido seguir.
   *
   * Antes de llamar ya se sabe qué va a hacer —cuántos documentos, cuántos
   * caracteres, cuántos campos— y se cuenta. Eso es lo que convierte la espera
   * en algo legible: no «cargando», sino «leyendo 3 documentos (12.480
   * caracteres) y preguntando por 44 campos».
   */
  async function pasadaIA(n: number, preguntados: string[]): Promise<boolean> {
    if (!id) return false;
    const legibles = (estado?.adjuntos ?? []).filter((a) => a.caracteres > 0);
    const caracteres = legibles.reduce((t, a) => t + a.caracteres, 0);
    const pendientes = (estado?.campos ?? []).filter((c) => !c.valor && !preguntados.includes(c.nombre));
    const frontera = Math.min(
      ...pendientes.filter((c) => c.gobierna).map((c) => c.nivel),
      Number.MAX_SAFE_INTEGER,
    );
    const van = pendientes.filter((c) => !c.gobierna || c.nivel === frontera).length;
    if (van === 0) { setIaFin("sinCampos"); return false; }

    setIaEnCurso({ n, docs: legibles.length, caracteres, campos: van, desde: Date.now() });
    const desde = Date.now();
    try {
      const res = await fetch(`${apiBase}/tareas/${id}/extraer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluir: preguntados }),
      });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) {
        setIaError(cuerpo?.error?.code === "IA_NO_CONFIGURADA"
          ? t("ui.docfillingProducer.iaNoConfigurada")
          : t("ui.docfillingProducer.iaFallo"));
        return false;
      }
      const d = cuerpo.data;
      const propuestas: ProducerPropuesta[] = d.propuestas ?? [];
      setIaPasadas((prev) => [...prev, {
        n, pedidos: d.pedidos ?? 0, propuestas: propuestas.length,
        sinDatos: (d.sinDatos ?? []).length, segundos: Math.round((Date.now() - desde) / 1000),
      }]);
      // Lo preguntado se acumula AUNQUE el modelo no haya propuesto nada: es
      // justo lo que no hay que volver a preguntar.
      const nuevos = [...preguntados, ...((d.camposPedidos ?? []) as string[])];
      setIaPreguntados(nuevos);
      setIa({
        propuestas,
        sinDatos: d.sinDatos ?? [],
        pedidos: d.pedidos ?? 0,
        contexto: d.contexto ?? { adjuntos: 0, conTexto: 0 },
        pendientes: d.pendientes ?? 0,
      });
      // «Nada que pedir» con campos todavía pendientes NO es «ya está»: es que
      // la frontera depende de condiciones que la IA no puede resolver y que
      // tiene que decidir una persona. Medido: tras aceptar 8 propuestas
      // quedaban 36 condiciones de nivel 0 sin datos en ningún documento, y
      // hasta que alguien las contesta no aparece el nivel siguiente. Decir
      // «no quedan campos» ahí sería mentir.
      if (d.nadaQuePedir) {
        setIaFin((d.pendientes ?? 0) > 0 ? "teToca" : "sinCampos");
        return false;
      }
      // Sin propuestas no hay nada que aceptar, así que tampoco aparecerán
      // campos nuevos: seguir sería repetir la misma llamada.
      if (propuestas.length === 0) {
        setIaFin((d.pendientes ?? 0) > 0 ? "sinPropuestas" : "sinCampos");
        return false;
      }
      return true;
    } finally { setIaEnCurso(null); }
  }

  /**
   * Que la IA lea los documentos y proponga campos (F5).
   *
   * Arranca el bucle: lee, propone, y cuando la persona acepta vuelve a leer con
   * los campos que acaban de aparecer. **Nunca acepta sola** — eso es lo que
   * separa esta función de rellenar la escritura por su cuenta.
   */
  async function leerConIA() {
    setIaError(null); setIaFin(null); setIa(null);
    setIaPasadas([]); setIaPreguntados([]); setIaAceptados(0);
    setExtrayendo(true);
    try { await pasadaIA(1, []); } finally { setExtrayendo(false); }
  }

  /**
   * Aceptar TODAS las propuestas de la pasada y seguir leyendo.
   *
   * Se aplican de una en una —contando por dónde va, porque son hasta decenas y
   * cada una es un `PATCH`— y al acabar se vuelve a leer: aceptar condiciones
   * reescribe el documento y lo que importa es lo que aparece DESPUÉS.
   */
  async function aceptarTodas() {
    if (!id || !ia || ia.propuestas.length === 0) return;
    const lote = ia.propuestas;
    setExtrayendo(true);
    try {
      for (let k = 0; k < lote.length; k++) {
        setIaAplicando({ hecho: k + 1, total: lote.length });
        await fetch(`${apiBase}/tareas/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campo: lote[k].campo, valor: lote[k].valor }),
        });
      }
      setIaAplicando(null);
      setIaAceptados((n) => n + lote.length);
      // El estado se recarga del servidor: qué campos existen ahora lo decide el
      // motor, y mantener una copia de esa lógica aquí es la forma de que
      // discrepen.
      await refrescar(id);
      const siguiente = iaPasadas.length + 1;
      if (siguiente > TOPE_PASADAS) { setIaFin("tope"); return; }
      await pasadaIA(siguiente, iaPreguntados);
    } finally { setIaAplicando(null); setExtrayendo(false); }
  }

  /** Aceptar una propuesta la convierte en un valor normal: entra por el mismo
   *  `PATCH` que si la hubiera teclado el oficial, que es exactamente lo que
   *  significa aceptarla. */
  async function aceptar(p: ProducerPropuesta) {
    await patch({ campo: p.campo, valor: p.valor }, p.campo);
    setIa((prev) => prev && { ...prev, propuestas: prev.propuestas.filter((x) => x.campo !== p.campo) });
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
          // ⚠️ LO QUE BLOQUEA SON LAS CONDICIONES, NO LOS DATOS (5-oct-2026).
          // Un dato que falta se ve —sale su hueco en la escritura—; una
          // condición sin contestar es invisible: su cláusula no aparece y el
          // documento sale más corto sin que nada lo diga.
          : code === "CONDICIONES_SIN_DECIDIR"
            ? t("ui.docfillingProducer.condicionesSinDecidir", {
                n: (cuerpo.error.condiciones ?? []).length,
                c: (cuerpo.error.condiciones ?? []).slice(0, 6).map((x: { etiqueta: string }) => x.etiqueta).join(", "),
                mas: cuerpo.error.despuesDeFrontera ?? 0,
              })
          : code === "FIRMA_SIN_ELEGIR"
            ? t("ui.docfillingProducer.firmaPendiente")
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

                {/* LOS FICHEROS, que es lo que la casilla de «aportado» no
                    puede dar: su texto viaja a la IA con el requisito al que
                    pertenece, y es de donde salen los campos (F5). */}
                <div className="mt-3 border-t border-gray-100 pt-2">
                  {(estado.adjuntos ?? []).filter((a) => a.requisitoCodigo === r.codigo).map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 py-1 text-xs">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="text-gray-900">{a.nombre}</span>
                      {a.caracteres > 0 ? (
                        <span className="text-gray-500">
                          {t("ui.docfillingProducer.adjuntoLeido", { n: a.caracteres })}
                        </span>
                      ) : (
                        // Un escaneado ilegible NO se oculta: sigue en la
                        // carpeta del expediente, pero la IA no va a sacar
                        // nada de él y contar con que sí es el error caro.
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {t("ui.docfillingProducer.adjuntoSinTexto")}
                        </span>
                      )}
                      {/* «Del expediente» se dice, porque lo que pasa al
                          quitarlo es distinto: un enlace SÓLO se desenlaza —el
                          original lo borra la app que lo creó— y quien lo quita
                          tiene que saber que no está borrando el documento del
                          expediente. */}
                      {a.origenNodeId && (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <Link2 className="h-3 w-3" />
                          {t("ui.docfillingProducer.adjuntoDelExpediente")}
                        </span>
                      )}
                      <button
                        type="button"
                        className="ml-auto text-gray-500 underline hover:text-gray-900 disabled:opacity-50"
                        disabled={subiendo === r.codigo}
                        onClick={() => void quitarAdjunto(r.codigo, a.id)}
                      >
                        {t(a.origenNodeId
                          ? "ui.docfillingProducer.desenlazarAdjunto"
                          : "ui.docfillingProducer.quitarAdjunto")}
                      </button>
                    </div>
                  ))}
                  {/* ENLAZAR EN VEZ DE SUBIR (F5.15). Cuando la generación
                      viene de un expediente, lo más habitual es que el
                      documento YA esté ahí: enlazarlo no duplica bytes y, si
                      Notaría lo corrige, aquí se ve corregido. */}
                  {candidatos && candidatos.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-mc-action-700 hover:underline">
                        {t("ui.docfillingProducer.enlazarDelExpediente", { n: candidatos.length })}
                      </summary>
                      <div className="mt-1 space-y-1">
                        {candidatos.map((c) => (
                          <button
                            key={c.nodeId}
                            type="button"
                            className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
                            disabled={enlazando === r.codigo}
                            onClick={() => void enlazar(r.codigo, a?.documentoCodigo ?? r.documentoCodigo ?? null, c.nodeId)}
                          >
                            {enlazando === r.codigo
                              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              : <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                            <span className="text-gray-900">{c.nombre}</span>
                            {/* Si aún no tiene texto extraído, enlazarlo
                                implica leerlo: se avisa porque tarda. */}
                            {!c.conTexto && (
                              <span className="text-gray-500">{t("ui.docfillingProducer.candidatoSinLeer")}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-mc-action-700 hover:underline">
                    {subiendo === r.codigo
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Upload className="h-3.5 w-3.5" />}
                    {subiendo === r.codigo
                      ? t("ui.docfillingProducer.adjuntoSubiendo")
                      : t("ui.docfillingProducer.adjuntar")}
                    <input
                      type="file"
                      className="hidden"
                      disabled={subiendo === r.codigo}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        // El input se limpia SIEMPRE: sin esto, volver a elegir
                        // el mismo fichero no dispara `change` y parece que la
                        // subida no hace nada.
                        e.target.value = "";
                        if (f) void adjuntar(r.codigo, a?.documentoCodigo ?? r.documentoCodigo ?? null, f);
                      }}
                    />
                  </label>
                </div>
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

          {/* Quién firma. Primero de todo, porque es lo que menos se puede
              equivocar y lo que más se da por supuesto. */}
          {estado.firma.usa && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <label className="block text-sm font-medium text-gray-900" htmlFor="firma-notario">
                {t("ui.docfillingProducer.quienFirma")}
              </label>
              {estado.firma.opciones.length > 1 ? (
                <>
                  <select
                    id="firma-notario"
                    className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                    value={estado.firma.valor ?? ""}
                    disabled={guardando === "NOMBRE_NOTARIO"}
                    onChange={(e) => void patch({ campo: "NOMBRE_NOTARIO", valor: e.target.value }, "NOMBRE_NOTARIO")}
                  >
                    <option value="">—</option>
                    {estado.firma.opciones.map((n) => (
                      <option key={n.authUserId} value={n.nombre}>{n.nombre}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("ui.docfillingProducer.variosNotarios", { n: estado.firma.opciones.length })}
                  </p>
                </>
              ) : estado.firma.valor ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-900">{estado.firma.valor}</span>
                  {estado.firma.origen === "derivado" && estado.firma.fuente && (
                    <span className="text-xs text-gray-500">
                      {t("ui.docfillingProducer.firmaSaleDe", { f: estado.firma.fuente })}
                    </span>
                  )}
                </div>
              ) : (
                <AlertBanner type="warning" message={t("ui.docfillingProducer.sinNotario")} />
              )}
            </div>
          )}

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

          {/* ── LA IA LEE LOS DOCUMENTOS, EN VARIAS PASADAS (F5.1) ─────────
              Propone, no rellena. Y **cuenta lo que hace**: una pasada puede
              tardar y detrás vienen más, así que lo que no puede haber es un
              reloj girando sin decir nada. Cada línea dice cuántos documentos
              lee, por cuántos campos pregunta y cuántos segundos lleva. */}
          {(estado.adjuntos?.length ?? 0) > 0 && !tarea.generadoAt && (
            <div className="rounded-lg border border-mc-action-200 bg-mc-action-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => void leerConIA()} disabled={extrayendo}>
                  {extrayendo
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    : <Sparkles className="mr-1.5 h-4 w-4" />}
                  {iaPasadas.length > 0 && !extrayendo
                    ? t("ui.docfillingProducer.iaLeerOtraVez")
                    : t("ui.docfillingProducer.iaLeer")}
                </Button>
                {!extrayendo && iaPasadas.length === 0 && (
                  <span className="text-xs text-gray-600">
                    {t("ui.docfillingProducer.iaDeQueLee", {
                      n: estado.adjuntos?.filter((a) => a.caracteres > 0).length ?? 0,
                      total: estado.adjuntos?.length ?? 0,
                    })}
                  </span>
                )}
              </div>

              {/* EL RELATO. Las pasadas ya hechas, en gris; la que está
                  corriendo, con su contador de segundos subiendo. */}
              {(iaPasadas.length > 0 || iaEnCurso || iaAplicando) && (
                <div className="mt-2 space-y-0.5 text-xs">
                  {iaPasadas.map((p) => (
                    <div key={p.n} className="flex items-center gap-1.5 text-gray-600">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>
                        {t("ui.docfillingProducer.iaPasada", { n: p.n })} ·{" "}
                        {t("ui.docfillingProducer.iaPasadaHecha", { propuestas: p.propuestas, pedidos: p.pedidos })}
                        {p.sinDatos > 0 ? ` · ${t("ui.docfillingProducer.iaSinDatos", { n: p.sinDatos })}` : ""}
                        {" · "}{t("ui.docfillingProducer.iaSegundos", { s: p.segundos })}
                      </span>
                    </div>
                  ))}
                  {iaAplicando && (
                    <div className="flex items-center gap-1.5 text-gray-700">
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      {t("ui.docfillingProducer.iaAplicando", { hecho: iaAplicando.hecho, total: iaAplicando.total })}
                    </div>
                  )}
                  {iaEnCurso && !iaAplicando && (
                    <div className="flex items-center gap-1.5 text-gray-700">
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      <span>
                        {t("ui.docfillingProducer.iaPasada", { n: iaEnCurso.n })} ·{" "}
                        {t("ui.docfillingProducer.iaEnCurso", {
                          docs: iaEnCurso.docs,
                          chars: iaEnCurso.caracteres.toLocaleString("es-ES"),
                          campos: iaEnCurso.campos,
                        })}
                        {" · "}
                        <span className="tabular-nums">{t("ui.docfillingProducer.iaSegundos", { s: iaSegundos })}</span>
                      </span>
                    </div>
                  )}
                  {/* A partir de medio minuto, decir DE QUIÉN es la espera. Es
                      cierto —la latencia de Vertex es capacidad compartida— y
                      es lo que evita que alguien recargue la página a mitad. */}
                  {iaEnCurso && iaSegundos >= 25 && (
                    <div className="pl-5 text-gray-500">{t("ui.docfillingProducer.iaLento")}</div>
                  )}
                </div>
              )}

              {iaError && <div className="mt-2"><AlertBanner type="warning" message={iaError} /></div>}

              {/* Por qué se paró. Cada final significa algo distinto y el
                  oficial tiene que saber cuál le toca. */}
              {iaFin && !extrayendo && (
                <p className="mt-2 text-xs text-gray-600">
                  {t(iaFin === "sinCampos" ? "ui.docfillingProducer.iaFinSinCampos"
                    : iaFin === "sinPropuestas" ? "ui.docfillingProducer.iaFinSinPropuestas"
                    : iaFin === "teToca" ? "ui.docfillingProducer.iaFinTeToca"
                    : "ui.docfillingProducer.iaFinTope",
                    { n: iaFin === "teToca" ? (ia?.pendientes ?? 0) : TOPE_PASADAS })}
                  {iaAceptados > 0 && ` ${t("ui.docfillingProducer.iaResumen", { pasadas: iaPasadas.length, aceptados: iaAceptados })}`}
                </p>
              )}

              {ia && ia.propuestas.length > 0 && (
                <div className="mt-3 space-y-2">
                  {/* El aviso va ARRIBA de las propuestas y no debajo: quien
                      acepta tiene que haberlo leído antes de aceptar. */}
                  <p className="text-xs text-gray-700">{t("ui.docfillingProducer.iaRevisar")}</p>
                  <Button onClick={() => void aceptarTodas()} disabled={extrayendo}>
                    <Check className="mr-1.5 h-4 w-4" />
                    {t("ui.docfillingProducer.iaAceptarTodas", { n: ia.propuestas.length })}
                  </Button>
                  {ia.propuestas.map((p) => (
                    <div key={p.campo} className="rounded-md border border-gray-200 bg-white p-2.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-900">{p.etiqueta}</span>
                        <span className={
                          p.confianza === "alta" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                          : p.confianza === "media" ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        }>
                          {t(`ui.docfillingProducer.iaConfianza_${p.confianza}`)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-900">«{p.valor}»</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {t("ui.docfillingProducer.iaFuente", { f: p.fuente })}
                        {p.porque ? ` · ${p.porque}` : ""}
                      </p>
                      <div className="mt-2">
                        <Button variant="outline" onClick={() => void aceptar(p)} disabled={guardando === p.campo || extrayendo}>
                          {guardando === p.campo
                            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            : <Check className="mr-1.5 h-3.5 w-3.5" />}
                          {t("ui.docfillingProducer.iaAceptar")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lo que la IA NO pudo proponer, con su motivo. «Faltan los
                  documentos de identidad de la parte compradora» le dice al
                  oficial qué pedir, que es más que un campo vacío. */}
              {ia && ia.sinDatos.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600">
                    {t("ui.docfillingProducer.iaSinDatos", { n: ia.sinDatos.length })}
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs text-gray-500">
                    {ia.sinDatos.slice(0, 12).map((s) => (
                      <li key={s.campo}>{s.campo}: {s.porque}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
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
                {/* No bloquea: se entrega con el hueco a la vista. Lo que
                    bloquea son las condiciones sin decidir. */}
                {t("ui.docfillingProducer.datosSalenComoHueco", { n: estado.camposPendientes })}
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
