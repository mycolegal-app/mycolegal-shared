"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { EventContentArg } from "@fullcalendar/core";
import { LoadingSpinner } from "../shared/loading-spinner";
import { NavLink } from "../shared/nav-link";
import { PageTitle } from "../layout/page-title";
import { useI18n } from "../i18n/i18n-context";
import {
  CATEGORIAS_COLOR,
  COLORES_AGENDA_DEFECTO,
  colorDeEvento,
  type ColoresAgenda,
  type CategoriaColor,
} from "../../lib/agenda-colores";

// F31 (Phase 10) — Agenda derivada.
// Pinta expedientes con fechaPrevistaFirma + protocolos con fechaFirma
// dentro de la ventana visible. No mantiene estado propio: cada cambio de
// vista pide al backend el rango actual.

type AgendaEvent = {
  id: string;
  kind: "expediente" | "protocolo" | "evento" | "bloqueo";
  // #185 — solo en hitos (kind "evento"):
  eventoId?: string;
  tipo?: "CONSULTA" | "REUNION" | "FIRMA" | "OTRO";
  // #281 Fase 2 — solo en bloqueos (kind "bloqueo"):
  bloqueoId?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  url: string | null;
  meta: Record<string, unknown>;
};

// #185 — formulario del diálogo de agenda. Al crear desde un hueco se puede
// agendar la FIRMA de un expediente o un HITO (consulta/reunión/otro).
type EventoForm = {
  id: string | null;
  modo: "hito" | "firma" | "bloqueo";
  titulo: string;
  tipo: "CONSULTA" | "REUNION" | "FIRMA" | "OTRO";
  // #629/#630 — solo para hitos de tipo FIRMA: a quién se le asigna y si va
  // señalada. Se envían siempre; el servidor los ignora si el tipo no es FIRMA.
  asignadoId: string;
  importante: boolean;
  inicio: string; // datetime-local
  fin: string; // datetime-local
  descripcion: string;
  // #372 — visibilidad de la cita manual (modo "hito").
  visibilidad: "PUBLICA" | "PRIVADA";
  // modo "firma":
  expedienteId: string | null;
  expedienteLabel: string;
  // #281 Fase 2 — modo "bloqueo": para quién ("" = toda la notaría).
  usuarioId: string;
  // #626 — con quién es la cita (directorio de Contactos) y si el notario sale
  // del despacho a firmar (banco, domicilio…).
  contactoId: string | null;
  contactoLabel: string;
  esSalida: boolean;
  lugar: string;
  // #672 — expediente abierto desde esta cita, si ya se abrió. No es editable
  // desde aquí: se establece al dar de alta el expediente. Sirve para ofrecer
  // la puerta ("crear expediente") o el enlace, según haya uno o no.
  expedienteVinculadoId: string | null;
  expedienteVinculadoRef: string | null;
  // #672 — ese expediente está anulado: la cita sigue viva y hay que cancelarla
  // a mano (o abrir otro expediente), pero eso lo decide una persona.
  expedienteVinculadoAnulado: boolean;
};

// Convierte un Date a valor de <input type="datetime-local"> en horario local.
function toLocalInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// #670 — La paleta ya no vive aquí: pasa a ser POR TIPO de cita y configurable
// por la notaría (`${apiBase}/agenda/colores`). El porqué del cambio y las dos cosas
// que NO son configurables están en `agenda-colores.ts`.

// #627 — Iniciales del empleado que lleva el expediente. En la agenda de papel
// que usaban, cada firma empieza por ellas ("SG- INSTANCIA Y TESTAMENTO...") y
// es lo que se busca de un vistazo para saber de quién es la firma. Dos letras
// como máximo: es una marca de reconocimiento, no un nombre legible.
function inicialesEmpleado(nombre: string | null): string | null {
  if (!nombre) return null;
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

// #185 (Etapa 3) — horario de firma de la notaría (para ver huecos libres).
type Horario = { diasLaborables: number[]; horaInicio: string; horaFin: string };
const DEFAULT_HORARIO: Horario = { diasLaborables: [1, 2, 3, 4, 5], horaInicio: "08:00", horaFin: "20:00" };

/**
 * #707 — Desplaza una hora "HH:MM" el nº de horas indicado, sin salirse del día.
 * Se usa para que la franja VISIBLE del calendario sea un poco más ancha que el
 * horario laboral: el horario dice cuándo se firma, no hasta dónde puede mirar
 * el notario.
 */
function margenHorario(hhmm: string, horas: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const desplazada = Math.min(Math.max(h + horas, 0), 24);
  // FullCalendar admite "24:00" como fin de día; como inicio no tiene sentido.
  return `${String(desplazada).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}
const DIAS_SEMANA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

export interface AgendaViewProps {
  /**
   * Raíz de la API de la app que la monta. En Notaría es la suya; en Pólizas,
   * LegiFirma y Archivo apunta a su proxy hacia el canal de servicio de Notaría,
   * que es la dueña de los datos (ver PLAN_AGENDA_GLOBAL).
   */
  apiBase?: string;
  /**
   * Piezas que solo existen en Notaría. El modo "firma" busca expedientes y el
   * alta de expediente desde una cita (#672) llevan a pantallas que las otras
   * apps no tienen: allí se ocultan, no fallan.
   */
  capacidades?: { expedientes?: boolean };
}

export function AgendaView({ apiBase = "/api", capacidades }: AgendaViewProps) {
  const conExpedientes = capacidades?.expedientes ?? true;
  const { t } = useI18n();
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  // #662 — fecha del selector "ir al día". Se mantiene en sincronía con lo que
  // se está viendo (`datesSet`) para que el control no se quede mostrando una
  // fecha vieja cuando se navega con las flechas.
  const [fechaIr, setFechaIr] = useState("");
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  // #185 — los firmados (protocolos) son historial; por defecto los ocultamos
  // para centrar la agenda en las firmas previstas (lo realmente agendado).
  const [showFirmados, setShowFirmados] = useState(false);
  // #372 — semana laboral (L-V) por defecto: oculta el fin de semana para
  // aprovechar el ancho. Se puede alternar a semana completa. Si la notaría
  // trabaja en fin de semana (según su horario), arranca en semana completa.
  const [showWeekend, setShowWeekend] = useState(false);
  // #372 — leyenda de colores plegable.
  const [showLegend, setShowLegend] = useState(false);
  // #185 — diálogo de hito (crear/editar/borrar).
  const [form, setForm] = useState<EventoForm | null>(null);
  const [saving, setSaving] = useState(false);
  // #281 Fase 2 — empleados para el selector "para quién" del bloqueo.
  const [empleados, setEmpleados] = useState<{ id: string; displayName: string }[]>([]);
  useEffect(() => {
    fetch(`${apiBase}/catalogs/empleados?pageSize=200`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const data = Array.isArray(j?.data) ? j.data : [];
        setEmpleados(data.map((e: any) => ({ id: e.id, displayName: e.displayName })));
      })
      .catch(() => setEmpleados([]));
  }, []);
  // #281 Fase 4 — diálogo del feed .ics saliente (URL + copiar + regenerar).
  const [icsUrl, setIcsUrl] = useState<string | null>(null);
  const [icsOpen, setIcsOpen] = useState(false);
  const [icsCopiado, setIcsCopiado] = useState(false);

  async function abrirIcs() {
    setIcsOpen(true);
    setIcsCopiado(false);
    try {
      const res = await fetch(`${apiBase}/agenda/ics-token`);
      const j = await res.json();
      if (res.ok && j?.data?.path) {
        setIcsUrl(`${window.location.origin}${j.data.path}`);
      }
    } catch {
      // se muestra vacío; el usuario puede reintentar regenerando.
    }
  }

  async function regenerarIcs() {
    if (!confirm(t("agendaPage.icsRegenerarConfirm"))) return;
    try {
      const res = await fetch(`${apiBase}/agenda/ics-token`, { method: "POST" });
      const j = await res.json();
      if (res.ok && j?.data?.path) {
        setIcsUrl(`${window.location.origin}${j.data.path}`);
        setIcsCopiado(false);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  // #670 — Paleta de la notaría. Se carga una vez; si falla, valen los defectos.
  const [colores, setColores] = useState<ColoresAgenda>(COLORES_AGENDA_DEFECTO);
  const [coloresForm, setColoresForm] = useState<ColoresAgenda | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/agenda/colores`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data) setColores(j.data); })
      .catch(() => {});
  }, []);

  async function guardarColores() {
    if (!coloresForm) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/agenda/colores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coloresForm),
      });
      if (!res.ok) throw new Error(t("agendaPage.errGuardar"));
      const j = await res.json();
      setColores(j.data ?? coloresForm);
      setColoresForm(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // #185 (Etapa 3) — horario de firma (huecos) + su diálogo de configuración.
  const [horario, setHorario] = useState<Horario>(DEFAULT_HORARIO);
  const [horarioForm, setHorarioForm] = useState<Horario | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/agenda/horario`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data) {
          setHorario(j.data);
          // #372 — si la notaría trabaja sábado (6) o domingo (0), arranca
          // mostrando el fin de semana; si no, en semana laboral.
          const dias: number[] = j.data.diasLaborables ?? [];
          if (dias.includes(0) || dias.includes(6)) setShowWeekend(true);
        }
      })
      .catch(() => {});
  }, []);

  async function guardarHorario() {
    if (!horarioForm) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/agenda/horario`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(horarioForm),
      });
      if (!res.ok) throw new Error(t("agendaPage.errGuardar"));
      setHorario(horarioForm);
      setHorarioForm(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function refetchActual() {
    const api = calendarRef.current?.getApi();
    if (api) fetchRange(api.view.activeStart, api.view.activeEnd);
  }

  // #281 Fase 5b — conflictos (solapes) de la franja elegida. Aviso blando.
  type Conflicto = { id: string; title: string; start: string; end: string };
  const [conflictos, setConflictos] = useState<{ firmas: Conflicto[]; bloqueos: Conflicto[] } | null>(null);
  const formModo = form?.modo;
  const formInicio = form?.inicio;
  const formFin = form?.fin;
  const formId = form?.id;
  useEffect(() => {
    if ((formModo !== "firma" && formModo !== "hito") || !formInicio) {
      setConflictos(null);
      return;
    }
    let cancel = false;
    const tid = setTimeout(() => {
      const params = new URLSearchParams({ inicio: new Date(formInicio).toISOString() });
      if (formModo === "hito" && formFin) params.set("fin", new Date(formFin).toISOString());
      if (formId) params.set("excludeId", `evento-${formId}`);
      fetch(`${apiBase}/agenda/conflictos?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancel) setConflictos(j?.data ?? null);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancel = true;
      clearTimeout(tid);
    };
  }, [formModo, formInicio, formFin, formId]);

  // #185 — buscador de expedientes para el modo "firma".
  // #626 — buscador del contacto de la cita (mismo patrón que el de expediente).
  const [contBusqueda, setContBusqueda] = useState("");
  const [contResultados, setContResultados] = useState<
    { id: string; nombre: string; apellidos: string | null; razonSocial: string | null }[]
  >([]);
  const [expBusqueda, setExpBusqueda] = useState("");
  const [expResultados, setExpResultados] = useState<{ id: string; numero: number; referencia: string | null }[]>([]);
  useEffect(() => {
    // #716 — En Pólizas, LegiFirma o Archivo no hay expedientes: sin esto se
    // pediría a un endpoint que allí no existe y el buscador daría error.
    if (!conExpedientes || !form || form.modo !== "firma" || form.expedienteId || expBusqueda.trim().length < 2) {
      setExpResultados([]);
      return;
    }
    let cancel = false;
    const id = setTimeout(() => {
      fetch(`${apiBase}/expedientes?search=${encodeURIComponent(expBusqueda.trim())}&pageSize=8&incluirTerminados=true`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancel && Array.isArray(j?.data)) setExpResultados(j.data);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(id);
    };
  }, [expBusqueda, form, conExpedientes]);

  // #626 — buscador del contacto citado (solo en modo hito, que es la cita
  // manual). Reutiliza el directorio de Contactos: nada que mantener aparte.
  useEffect(() => {
    if (!form || form.modo !== "hito" || form.contactoId || contBusqueda.trim().length < 2) {
      setContResultados([]);
      return;
    }
    let cancel = false;
    const id = setTimeout(() => {
      fetch(`/api/catalogs/clientes?search=${encodeURIComponent(contBusqueda.trim())}&pageSize=8`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancel && Array.isArray(j?.data)) setContResultados(j.data);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(id);
    };
  }, [contBusqueda, form]);

  // #628 — Un único punto de apertura del diálogo en blanco. Cada entrada
  // (arrastrar un hueco, "+ Nueva cita", "+ Nuevo bloqueo") decide con qué modo
  // abre y ya no se puede cambiar dentro: el selector de tres modos que había
  // sobraba, porque el título del diálogo ya dice qué se está creando.
  /**
   * #652 — Al mover el INICIO, el fin se desplaza con él conservando la
   * duración. Antes el fin se quedaba clavado en el día que trajera el diálogo
   * (por defecto, hoy), así que cambiar el inicio a otro día dejaba una cita
   * que empezaba un día y terminaba otro, o directamente al revés.
   */
  function cambiarInicio(nuevoInicio: string) {
    if (!form) return;
    const antes = new Date(form.inicio).getTime();
    const despues = new Date(nuevoInicio).getTime();
    const finAntes = form.fin ? new Date(form.fin).getTime() : NaN;
    const duracion =
      Number.isFinite(antes) && Number.isFinite(finAntes) && finAntes > antes
        ? finAntes - antes
        : 30 * 60_000;
    setForm({
      ...form,
      inicio: nuevoInicio,
      fin: Number.isFinite(despues) ? toLocalInput(new Date(despues + duracion)) : form.fin,
    });
  }

  function abrirDialogo(modo: EventoForm["modo"], inicio: Date, fin: Date) {
    setError("");
    setExpBusqueda("");
    setExpResultados([]);
    setContBusqueda("");
    setContResultados([]);
    setForm({
      id: null,
      modo,
      titulo: "",
      tipo: modo === "hito" ? "REUNION" : "CONSULTA",
      inicio: toLocalInput(inicio),
      fin: toLocalInput(fin),
      descripcion: "",
      visibilidad: "PUBLICA",
      expedienteId: null,
      expedienteLabel: "",
      usuarioId: "",
      contactoId: null,
      contactoLabel: "",
      esSalida: false,
      lugar: "",
      asignadoId: "",
      importante: false,
      expedienteVinculadoId: null,
      expedienteVinculadoRef: null,
      expedienteVinculadoAnulado: false,
    });
  }

  /**
   * #662 — Cambiar qué se está creando sin salir del diálogo.
   *
   * Arrastrar un hueco abre en modo "firma", que exige expediente. Es lo
   * correcto para el caso más frecuente —agendar la firma de un expediente— y
   * cambiar el modo por defecto degradaría esas firmas a citas sueltas, sin
   * vínculo con su expediente. Pero la notaría quiere usar la agenda para todo
   * (reuniones, consultas, apartar horas) y el gesto natural las llevaba al
   * único modo que no sirve para eso, sin salida: desde #628 no hay selector
   * dentro y había que cancelar e ir a buscar el botón de la barra.
   *
   * Se conserva la hora elegida, que es lo que el usuario acaba de decidir con
   * el ratón, y se limpian los campos propios del modo que se abandona para no
   * arrastrar un expediente a una cita que ya no lo lleva.
   */
  function cambiarModo(nuevoModo: EventoForm["modo"]) {
    if (!form) return;
    setError("");
    setExpBusqueda("");
    setExpResultados([]);
    setForm({
      ...form,
      modo: nuevoModo,
      tipo: nuevoModo === "hito" ? "REUNION" : "CONSULTA",
      expedienteId: null,
      expedienteLabel: "",
      usuarioId: "",
    });
  }

  // Arrastrar un hueco del calendario es agendar una firma (#628).
  //
  // #650/#652 — Salvo cuando la selección viene de una celda de DÍA COMPLETO
  // (vista de mes): allí no hay hora que arrastrar, así que FullCalendar da las
  // 00:00 del día. Con eso se abría el diálogo de firma de expediente a
  // medianoche, fuera del horario visible del calendario, y quien no traía un
  // expediente a mano se quedaba sin poder guardar. Clicar un día abre ahora la
  // misma ventana que "+ Nueva cita", a la primera hora laborable de ese día;
  // el tipo FIRMA está en su desplegable, así que se puede agendar igual.
  function openCrear(inicio: Date, fin: Date, allDay = false) {
    if (!allDay) {
      abrirDialogo("firma", inicio, fin);
      return;
    }
    const [h, m] = horario.horaInicio.split(":").map(Number);
    const dia = new Date(inicio);
    dia.setHours(h ?? 9, m ?? 0, 0, 0);
    abrirDialogo("hito", dia, new Date(dia.getTime() + 30 * 60_000));
  }

  // Media hora de duración: el hueco por defecto de los botones de la barra,
  // que no parten de un arrastre.
  //
  // #680 — Partía siempre de `new Date()`, así que tras navegar a otro día (el
  // selector "Ir al día" de #662, las flechas ‹ › o un cambio de mes) los
  // botones seguían proponiendo HOY y había que corregir la fecha a mano en el
  // diálogo. Ahora se mira lo que el calendario tiene delante:
  //   · si hoy cae dentro del rango visible, se conserva el comportamiento de
  //     siempre (la próxima hora en punto), que es lo útil en la semana en curso;
  //   · si no, se propone la primera hora laborable del día al que se ha ido,
  //     igual que hace `openCrear` al clicar una celda de la vista de mes.
  // Se usa `getDate()` (la fecha a la que se ha navegado) y no `activeStart`:
  // en la vista de mes el rango arranca en los últimos días del mes anterior.
  function proximoHueco(): [Date, Date] {
    const api = calendarRef.current?.getApi();
    const v = api?.view;
    const ahora = new Date();

    if (!api || !v || (ahora >= v.activeStart && ahora < v.activeEnd)) {
      const inicio = new Date(ahora);
      inicio.setMinutes(0, 0, 0);
      inicio.setHours(inicio.getHours() + 1);
      return [inicio, new Date(inicio.getTime() + 30 * 60000)];
    }

    const [h, m] = horario.horaInicio.split(":").map(Number);
    const inicio = new Date(api.getDate());
    inicio.setHours(h ?? 9, m ?? 0, 0, 0);
    return [inicio, new Date(inicio.getTime() + 30 * 60000)];
  }

  // #372 — "+ Nueva cita": abre el diálogo directamente en modo hito (cita
  // manual), sin tener que arrastrar un hueco.
  function openNuevaCita() {
    abrirDialogo("hito", ...proximoHueco());
  }

  // #628 — "+ Nuevo bloqueo": los bloqueos se creaban solo desde el selector de
  // modos del diálogo, así que al retirarlo se quedaban sin puerta de entrada.
  function openNuevoBloqueo() {
    abrirDialogo("bloqueo", ...proximoHueco());
  }

  function openEditar(ev: AgendaEvent) {
    setForm({
      id: ev.eventoId ?? null,
      modo: "hito",
      titulo: ev.title,
      tipo: ev.tipo ?? "OTRO",
      inicio: toLocalInput(new Date(ev.start)),
      fin: toLocalInput(new Date(ev.end)),
      descripcion: (ev.meta?.descripcion as string) ?? "",
      visibilidad: (ev.meta?.visibilidad as EventoForm["visibilidad"]) ?? "PUBLICA",
      expedienteId: null,
      expedienteLabel: "",
      usuarioId: "",
      contactoId: (ev.meta?.contactoId as string | null) ?? null,
      contactoLabel: (ev.meta?.contacto as string | null) ?? "",
      esSalida: ev.meta?.esSalida === true,
      lugar: (ev.meta?.lugar as string | null) ?? "",
      // #629/#630 — al reabrir una firma hay que recuperar a quién está
      // asignada y si va señalada, o editarla las borraría sin querer.
      asignadoId: (ev.meta?.asignadoId as string | null) ?? "",
      importante: ev.meta?.importante === true,
      // #672 — si de esta cita ya salió un expediente, el diálogo lo enseña en
      // vez de volver a ofrecer crearlo.
      expedienteVinculadoId: (ev.meta?.expedienteId as string | null) ?? null,
      expedienteVinculadoRef: (ev.meta?.expedienteRef as string | null) ?? null,
      expedienteVinculadoAnulado: ev.meta?.expedienteAnulado === true,
    });
  }

  async function guardarEvento() {
    if (!form) return;
    setSaving(true);
    try {
      let res: Response;
      if (form.modo === "firma") {
        // #185 — asignar la firma de un expediente al hueco (su fechaPrevistaFirma).
        if (!form.expedienteId) {
          setError(t("agendaPage.errSinExpediente"));
          setSaving(false);
          return;
        }
        res = await fetch(`${apiBase}/expedientes/${form.expedienteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fechaPrevistaFirma: new Date(form.inicio).toISOString(),
            // #650 — y su hora de fin, que hasta ahora no se pedía ni se
            // guardaba: la agenda deducía 45' de la duración por tipo. Vacío
            // vuelve a esa deducción.
            finPrevistoFirma: form.fin ? new Date(form.fin).toISOString() : null,
            // #626 — salida fuera del despacho para esta firma.
            firmaEsSalida: form.esSalida,
            lugarFirma: form.lugar.trim() || null,
          }),
        });
      } else if (form.modo === "bloqueo") {
        // #281 Fase 2 — crear un bloqueo de día/franja. usuarioId "" = notaría.
        res = await fetch(`${apiBase}/agenda/bloqueos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo: form.titulo.trim() || null,
            inicio: new Date(form.inicio).toISOString(),
            fin: new Date(form.fin || form.inicio).toISOString(),
            usuarioId: form.usuarioId || null,
          }),
        });
      } else {
        if (!form.titulo.trim()) {
          setError(t("agendaPage.errSinTitulo"));
          setSaving(false);
          return;
        }
        const payload = {
          titulo: form.titulo.trim(),
          tipo: form.tipo,
          inicio: new Date(form.inicio).toISOString(),
          fin: form.fin ? new Date(form.fin).toISOString() : null,
          descripcion: form.descripcion.trim() || null,
          visibilidad: form.visibilidad,
          // #626 — contacto citado y salida fuera del despacho.
          contactoId: form.contactoId,
          esSalida: form.esSalida,
          lugar: form.lugar.trim() || null,
          // #629/#630 — el servidor los descarta si el tipo no es FIRMA.
          asignadoId: form.asignadoId || null,
          importante: form.importante,
        };
        res = await fetch(form.id ? `${apiBase}/agenda/eventos/${form.id}` : `${apiBase}/agenda/eventos`, {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message || t("agendaPage.errGuardar"));
      }
      setForm(null);
      refetchActual();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function borrarEvento() {
    if (!form?.id) return;
    if (!confirm(t("agendaPage.confirmBorrar"))) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/agenda/eventos/${form.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("agendaPage.errBorrar"));
      setForm(null);
      refetchActual();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // #281 Fase 2 — borrar un bloqueo (al clicarlo en el calendario).
  async function borrarBloqueo(bloqueoId: string) {
    if (!confirm(t("agendaPage.confirmBorrarBloqueo"))) return;
    try {
      const res = await fetch(`${apiBase}/agenda/bloqueos/${bloqueoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("agendaPage.errBorrar"));
      refetchActual();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const fetchRange = useCallback(
    async (from: Date, to: Date) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        if (onlyMine) params.set("asignadoId", "CURRENT");
        const res = await fetch(`${apiBase}/agenda?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || t("agendaPage.errLoad"));
        setEvents(json.data || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [onlyMine, t],
  );

  // Cuando cambia onlyMine forzamos un refetch del rango actual.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    fetchRange(api.view.activeStart, api.view.activeEnd);
  }, [fetchRange]);

  // #281 Fase 1 — render del evento: para expedientes a firmar añadimos
  // titular, acto(s) y empleado bajo el título; el resto usa el render básico.
  function renderEventContent(arg: EventContentArg) {
    const kind = arg.event.extendedProps.kind as AgendaEvent["kind"] | undefined;
    const meta = (arg.event.extendedProps.meta ?? {}) as Record<string, unknown>;
    const titular = (meta.titular as string | null) ?? null;
    const actos = (meta.actos as string[] | undefined) ?? [];
    const asignado = (meta.asignado as string | null) ?? null;
    const extra = kind === "expediente";
    // #372 — candado en las citas privadas: enmascarada (ajena) muestra solo
    // "🔒 Ocupado"; la propia lleva el candado junto a su título.
    const masked = kind === "evento" && meta.masked === true;
    const privadaMia = kind === "evento" && meta.visibilidad === "PRIVADA" && meta.esMia === true;
    // #626 — contacto citado y salida fuera del despacho.
    const contacto = (meta.contacto as string | null) ?? null;
    const esSalida = meta.esSalida === true;
    const lugar = (meta.lugar as string | null) ?? null;
    // #372 — en las vistas de rejilla horaria (Día/Semana) la altura del bloque
    // la fija la duración de la cita, así que las líneas de detalle (titular,
    // actos, empleado) no caben en firmas cortas y la última quedaba cortada a
    // media altura. En timeGrid mostramos solo lo esencial; el detalle completo
    // se ve en Mes/Lista y al hacer clic.
    const compact = arg.view.type.startsWith("timeGrid");
    // #627 — En una firma prevista la cabecera es el ACTO JURÍDICO precedido de
    // las iniciales del empleado, no "EXP-123 — Firma prevista". El número de
    // expediente se comía la línea entera sin decir nada que no se sepa al
    // abrirlo, y lo que hace falta de un vistazo es qué se firma y de quién es.
    // Si el expediente aún no tiene acto asignado se cae al título de siempre,
    // que al menos identifica el bloque.
    // #629 — un hito de tipo FIRMA lleva empleado asignado igual que la firma
    // de un expediente, así que se rotula igual. El nombre no viaja en el meta
    // (no hay relación declarada), se resuelve con la lista ya cargada.
    const esHitoFirma =
      kind === "evento" && !masked && arg.event.extendedProps.tipo === "FIRMA";
    const asignadoHito = esHitoFirma
      ? (empleados.find((e) => e.id === meta.asignadoId)?.displayName ?? null)
      : null;
    const iniciales = inicialesEmpleado(extra ? asignado : asignadoHito);
    const cabecera = extra && actos.length > 0 ? actos.join(", ") : arg.event.title;
    // #630 — firma señalada. Un signo delante basta: el bloque es estrecho y
    // una palabra entera le comería la línea al acto.
    const importante = meta.importante === true && !masked;
    // #626 — en Día/Semana la hora ya está en el eje del margen izquierdo, y a
    // la altura del bloque; repetirla en cada cuadro llenaba la pantalla de
    // horas sin aportar nada ("transmite poca información"). En esas vistas la
    // omitimos y usamos la línea para QUIÉN, que es el dato que se busca de un
    // vistazo. En Mes/Lista no hay eje horario, así que ahí sí se muestra.
    const quien = contacto ?? (extra ? titular : null);
    // #668 — la descripción de una cita manual es donde la notaría apunta lo que
    // no cabe en el título: el cliente y su teléfono cuando la cita es un acta
    // de manifestaciones, la referencia de quien llama... Viajaba en el meta
    // desde #185 pero no se pintaba nunca, así que había que abrir la cita para
    // leerla. Va justo bajo la cabecera, que es donde se pidió, y sin etiqueta:
    // es texto libre, no un campo con nombre.
    //
    // Una cita ajena enmascarada llega con la descripción anulada desde el
    // servidor (#372), así que aquí no hay nada que comprobar.
    //
    // En Día/Semana la altura del bloque la fija la duración, y una cita de
    // media hora ya gasta sus líneas en el contacto y el lugar. Ahí se muestra
    // solo cuando NO hay contacto, que es justamente el caso que motiva la
    // petición: sin contacto vinculado, el nombre y el teléfono están en la
    // descripción y si no se pinta el bloque no dice de quién es.
    const descripcion = (meta.descripcion as string | null) ?? null;
    const mostrarDescripcion = descripcion && (!compact || !quien);
    // #672 — cita cuyo expediente se anuló. Se avisa SIEMPRE, también en las
    // vistas compactas: es lo único de esta tarjeta que exige una llamada, y
    // callarlo dejaría al cliente presentándose a una hora que ya no existe.
    const expedienteAnulado = meta.expedienteAnulado === true;
    return (
      <div className="overflow-hidden px-0.5 text-[11px] leading-tight">
        {arg.timeText && !compact && <div className="font-semibold">{arg.timeText}</div>}
        <div className="truncate font-medium">
          {(masked || privadaMia) && <span aria-hidden="true">🔒 </span>}
          {esSalida && !masked && <span aria-hidden="true">🚗 </span>}
          {importante && <span title={t("agendaPage.firmaImportante")}>❗</span>}
          {iniciales && <span className="opacity-80">{iniciales} · </span>}
          {cabecera}
        </div>
        {expedienteAnulado && (
          <div className="truncate font-semibold">⚠ {t("agendaPage.expedienteAnulado")}</div>
        )}
        {mostrarDescripcion && <div className="truncate opacity-90">{descripcion}</div>}
        {compact && quien && <div className="truncate opacity-90">{quien}</div>}
        {compact && esSalida && lugar && <div className="truncate opacity-80">{lugar}</div>}
        {!compact && extra && titular && (
          <div className="truncate">
            {t("agendaPage.metaTitular")}: {titular}
          </div>
        )}
        {!compact && contacto && (
          <div className="truncate">
            {t("agendaPage.metaContacto")}: {contacto}
          </div>
        )}
        {!compact && esSalida && (
          <div className="truncate">
            {t("agendaPage.metaSalida")}
            {lugar ? `: ${lugar}` : ""}
          </div>
        )}
        {/* #627 — El acto ya encabeza el bloque; repetirlo aquí sobraba. */}
        {!compact && asignado && (
          <div className="truncate opacity-80">
            {t("agendaPage.metaEmpleado")}: {asignado}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 pb-4">
        <PageTitle title={t("agendaPage.title")} subtitle={t("agendaPage.subtitle")} />
        <div className="flex items-center gap-3">
          {/* #372 — alta directa de una cita manual (sin arrastrar un hueco). */}
          <button
            type="button"
            onClick={openNuevaCita}
            className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700"
          >
            {t("agendaPage.btnNuevaCita")}
          </button>
          {/* #631 — Imprimir lo que se está viendo. Sale del propio calendario
              (`view.activeStart/activeEnd`) en vez de recalcular el rango, para
              que el papel case con la pantalla en cualquier vista y con el
              filtro de empleado puesto. `activeEnd` es exclusivo: se resta un
              minuto o la semanal se llevaría el lunes siguiente. */}
          <button
            type="button"
            onClick={() => {
              const api = calendarRef.current?.getApi();
              if (!api) return;
              const v = api.view;
              const hasta = new Date(v.activeEnd.getTime() - 60000);
              const qs = new URLSearchParams({
                from: v.activeStart.toISOString(),
                to: hasta.toISOString(),
                // #679 — La zona del navegador, para que el papel salga con las
                // mismas horas que la pantalla. Sin esto el servidor formateaba
                // en UTC e imprimía las firmas dos horas antes.
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
              if (onlyMine) qs.set("asignadoId", "CURRENT");
              window.open(`${apiBase}/agenda/print?${qs}`, "_blank");
            }}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("agendaPage.btnImprimir")}
          </button>
          {/* #662 — Ir a un día cualquiera. La barra solo traía "‹ › Hoy", así
              que llegar a otro mes era ir saltando semana a semana; el enlace
              del número de día (#651) solo sirve dentro del rango ya visible.
              Se usa un <input type="date"> nativo a propósito: trae el
              calendario del sistema, ya está traducido y no añade dependencia.
              Cambia de fecha sin cambiar de vista, para no perder la semanal o
              la mensual que el usuario tuviera puesta. */}
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            {t("agendaPage.irAlDia")}
            <input
              type="date"
              value={fechaIr}
              onChange={(e) => {
                const v = e.target.value;
                setFechaIr(v);
                if (!v) return;
                // Mediodía local: construir la fecha desde "YYYY-MM-DD" la
                // interpreta como UTC y en España caería en el día anterior.
                const [y, m, d] = v.split("-").map(Number);
                calendarRef.current?.getApi().gotoDate(new Date(y, m - 1, d, 12));
              }}
              className="rounded-md border px-2 py-1 text-xs"
            />
          </label>
          {/* #628 — Puerta propia del bloqueo: antes solo se llegaba por el
              selector de modos del diálogo, que se ha retirado. */}
          <button
            type="button"
            onClick={openNuevoBloqueo}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("agendaPage.btnNuevoBloqueo")}
          </button>
          <button
            type="button"
            onClick={() => setHorarioForm(horario)}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("agendaPage.btnHorario")}
          </button>
          <button
            type="button"
            onClick={abrirIcs}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("agendaPage.btnIcs")}
          </button>
          {/* #372 — leyenda de colores plegable. */}
          <button
            type="button"
            onClick={() => setShowLegend((v) => !v)}
            aria-expanded={showLegend}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("agendaPage.btnLeyenda")}
          </button>
          {/* #372 — semana laboral (L-V) ↔ completa (7 días). */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showWeekend}
              onChange={(e) => setShowWeekend(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t("agendaPage.showWeekend")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showFirmados}
              onChange={(e) => setShowFirmados(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t("agendaPage.showFirmados")}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t("agendaPage.onlyMine")}
          </label>
        </div>
      </div>

      {/* #372 — leyenda de colores. #670 — ahora por TIPO de cita, con los
          colores de la notaría y un enlace para cambiarlos. */}
      {showLegend && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {CATEGORIAS_COLOR.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: colores[cat] }}
                aria-hidden="true"
              />
              {t(`agendaPage.leyenda.${cat}`)}
            </span>
          ))}
          {/* El gris de "Ocupado" no se configura: es el color de una cita
              privada ajena y no debe poder confundirse con ninguna otra. */}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm bg-[#94a3b8]"
              aria-hidden="true"
            />
            {t("agendaPage.leyendaOcupado")}
          </span>
          <button
            type="button"
            onClick={() => setColoresForm({ ...colores })}
            className="font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
          >
            {t("agendaPage.cambiarColores")}
          </button>
        </div>
      )}

      {/* #670 — Diálogo de colores. Un `input type=color` nativo por categoría:
          trae el selector del sistema, no añade dependencia y devuelve #rrggbb,
          que es justo lo que valida el servidor. */}
      {coloresForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">{t("agendaPage.coloresTitulo")}</h3>
            <div className="space-y-2">
              {CATEGORIAS_COLOR.map((cat) => (
                <label key={cat} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t(`agendaPage.leyenda.${cat}`)}</span>
                  <input
                    type="color"
                    value={coloresForm[cat]}
                    onChange={(e) =>
                      setColoresForm({ ...coloresForm, [cat]: e.target.value } as ColoresAgenda)
                    }
                    className="h-8 w-14 cursor-pointer rounded border"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setColoresForm({ ...COLORES_AGENDA_DEFECTO })}
                className="text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
              >
                {t("agendaPage.coloresRestablecer")}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setColoresForm(null)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={guardarColores}
                  disabled={saving}
                  className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-3">
        {loading && (
          <div className="absolute right-4 top-4 z-10">
            <LoadingSpinner size="sm" />
          </div>
        )}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale={esLocale}
          nowIndicator
          firstDay={1}
          height="100%"
          // #372 — semana laboral (fin de semana oculto) por defecto para
          // aprovechar el ancho; alternable con el toggle de la barra.
          weekends={showWeekend}
          // #372 — más aire y legibilidad cuando hay muchas firmas seguidas:
          // filas que se expanden, slots de 30', altura mínima de evento y sin
          // solape visual (se reparten en columnas en vez de pisarse).
          expandRows
          slotDuration="00:30:00"
          slotEventOverlap={false}
          // #627 — 26px daba para una línea y media: la segunda (el
          // interviniente) se cortaba en las firmas de media hora, que son la
          // mayoría. El bloque tiene que mostrar acto e interviniente enteros,
          // como en la agenda de papel, así que se sube a dos líneas holgadas.
          eventMinHeight={40}
          dayMaxEvents
          // #185 (Etapa 3) — el horario de firma sombrea las horas laborables;
          // lo libre = hueco. Acota la franja visible al horario configurado.
          businessHours={{
            daysOfWeek: horario.diasLaborables,
            startTime: horario.horaInicio,
            endTime: horario.horaFin,
          }}
          // #707 — "La agenda solo deja ver hasta 19:00. Debería dejar hasta
          // las 20:00. Es verdad que el despacho cierra a las 19:00, pero así me
          // sirve para controlar temas privados."
          //
          // La banda visible valía el horario laboral, así que la agenda se
          // cortaba exactamente donde cierra el despacho y no había forma de ver
          // —ni de poner— nada fuera de él. Son dos cosas distintas: el horario
          // dice cuándo se firma (y es lo que se sombrea), la banda visible
          // dice hasta dónde llega el papel. Se abre una hora por cada lado.
          slotMinTime={margenHorario(horario.horaInicio, -1)}
          slotMaxTime={margenHorario(horario.horaFin, +1)}
          // #626 — "Hoy" abría la SEMANA que contiene hoy, que empieza en lunes:
          // estando ya en la semana en curso el botón no hacía nada visible
          // ("si se selecciona hoy, no pasa nada; se ve desde lunes"). Ahora
          // lleva al DÍA de hoy, que es lo que se espera al pedir "hoy". Para
          // volver a la semana están los botones de vista de la derecha.
          customButtons={{
            hoy: {
              text: t("agendaPage.btnToday"),
              click: () => calendarRef.current?.getApi().changeView("timeGridDay", new Date()),
            },
          }}
          headerToolbar={{
            left: "prev,next hoy",
            center: "title",
            right: "listWeek,dayGridMonth,timeGridWeek,timeGridDay",
          }}
          buttonText={{
            today: t("agendaPage.btnToday"),
            month: t("agendaPage.btnMonth"),
            week: t("agendaPage.btnWeek"),
            day: t("agendaPage.btnDay"),
            list: t("agendaPage.btnList"),
          }}
          // #651 — clicar el día (su número o su cabecera) abre la agenda de ese
          // día. Antes había que ir con las flechas semana a semana.
          navLinks
          navLinkDayClick={(date) =>
            calendarRef.current?.getApi().changeView("timeGridDay", date)
          }
          datesSet={(info) => {
            fetchRange(info.start, info.end);
            // `info.start` es el primer día del rango visible; en la mensual
            // puede caer en el mes anterior, así que se toma la fecha que
            // FullCalendar considera actual.
            const actual = info.view.calendar.getDate();
            setFechaIr(
              new Date(actual.getTime() - actual.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 10),
            );
          }}
          // #185/#628 — arrastrar o clicar un hueco abre el diálogo en modo
          // firma; desde dentro se puede cambiar a cita o bloqueo (#662).
          selectable
          select={(info) => openCrear(info.start, info.end, info.allDay)}
          events={events
            .filter((ev) => showFirmados || ev.kind !== "protocolo")
            .map((ev) => {
              const color = colorDeEvento(ev, colores);
              return {
                id: ev.id,
                title: ev.title,
                start: ev.start,
                end: ev.end,
                allDay: ev.allDay,
                url: ev.url ?? undefined,
                backgroundColor: color,
                borderColor: color,
                // #281 Fase 2 — los bloqueos se pintan como franja de fondo.
                display: ev.kind === "bloqueo" ? "background" : undefined,
                // #629 — el tipo del hito llega hasta el render para distinguir
                // una FIRMA de una consulta o una reunión.
                extendedProps: { kind: ev.kind, tipo: ev.tipo, meta: ev.meta },
              };
            })}
          // #281 Fase 1 — la firma prevista muestra titular, acto y empleado.
          eventContent={renderEventContent}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            const ev = events.find((e) => e.id === info.event.id);
            if (!ev) return;
            // #281 Fase 2 — clicar un bloqueo lo borra (tras confirmar).
            if (ev.kind === "bloqueo" && ev.bloqueoId) {
              void borrarBloqueo(ev.bloqueoId);
              return;
            }
            // #372 — una cita privada ajena está enmascarada ("Ocupado"): no
            // tiene detalle ni editor, solo informa de que la franja está tomada.
            if (ev.kind === "evento" && ev.meta?.masked) {
              return;
            }
            // #281 Fase 3 — las citas de otras apps abren su deep-link externo.
            if (ev.kind === "evento" && (ev.meta?.origen ?? "MANUAL") !== "MANUAL") {
              if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
              return;
            }
            // #185 — los hitos manuales abren el editor; expedientes/protocolos navegan.
            if (ev.kind === "evento") openEditar(ev);
            else if (ev.url) router.push(ev.url);
          }}
        />
      </div>

      {/* #185 — diálogo de hito de agenda (consulta/reunión/otro). */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">
              {form.id
                ? t("agendaPage.editarHito")
                : form.modo === "firma"
                  ? t("agendaPage.agendarFirma")
                  : form.modo === "bloqueo"
                    ? t("agendaPage.nuevoBloqueo")
                    : t("agendaPage.nuevoHito")}
            </h3>
            {/* #628 — Aquí vivía un selector de firma/hito/bloqueo con los tres
                modos al mismo nivel; se retiró porque el preseleccionado
                repetía el título del diálogo.
                #662 — Lo que faltaba no era el selector, era la SALIDA: quien
                arrastra un hueco para apartar una hora acababa en el diálogo de
                firma, que pide expediente, y tenía que cancelar. Se ofrecen
                solo los OTROS dos modos, como enlaces y no como botones al
                mismo nivel: el título sigue diciendo qué se está creando. */}
            {!form.id && (
              <p className="mb-3 text-xs text-gray-500">
                {t("agendaPage.cambiarModoPregunta")}{" "}
                {(["firma", "hito", "bloqueo"] as const)
                  .filter((m) => m !== form.modo)
                  // #716 — El modo "firma" ata la cita a un EXPEDIENTE, que solo
                  // existe en Notaría. Donde no los hay se ofrece apartar una
                  // hora o crear una cita, que es lo que allí tiene sentido.
                  .filter((m) => m !== "firma" || conExpedientes)
                  .map((m, i) => (
                    <span key={m}>
                      {i > 0 && " · "}
                      <button
                        type="button"
                        onClick={() => cambiarModo(m)}
                        className="font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
                      >
                        {t(`agendaPage.cambiarModo.${m}`)}
                      </button>
                    </span>
                  ))}
              </p>
            )}
            {/* #672 — La notaría agenda antes de abrir el expediente ("en la
                mayoría de los casos agendamos antes de crear expediente"), así
                que la cita ya existente es el sitio natural para abrirlo. Se
                lleva la hora, la descripción y el contacto al alta, que es
                donde se elige el acto: eso no se puede deducir de una cita.
                Cuando ya hay expediente, la puerta se sustituye por el enlace,
                que evita crear un segundo por olvido. */}
            {/* #716 — Todo este bloque (expediente vinculado y la puerta para
                crearlo desde la cita) lleva a pantallas que solo existen en
                Notaría: donde no las hay, se oculta en vez de fallar. */}
            {conExpedientes && form.id && form.modo === "hito" && (
              <p className="mb-3 text-xs text-gray-500">
                {form.expedienteVinculadoId && (
                  <>
                    {t("agendaPage.expedienteVinculado")}{" "}
                    <NavLink
                      href={`/expedientes/${form.expedienteVinculadoId}`}
                      className="font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
                    >
                      {form.expedienteVinculadoRef ?? t("agendaPage.verExpediente")}
                    </NavLink>
                    {form.expedienteVinculadoAnulado && (
                      <span className="ml-1 font-semibold text-amber-700">
                        ⚠ {t("agendaPage.expedienteAnuladoAviso")}
                      </span>
                    )}
                  </>
                )}
                {/* La puerta se ofrece cuando no hay expediente y también cuando
                    el que había se anuló: encadenar la cita a un expediente
                    muerto no deja salida, y el asunto suele reabrirse en otro. */}
                {(!form.expedienteVinculadoId || form.expedienteVinculadoAnulado) && (
                  <button
                    type="button"
                    onClick={() => router.push(`/expedientes/nuevo?desdeCita=${form.id}`)}
                    className={`font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800${
                      form.expedienteVinculadoId ? " ml-1" : ""
                    }`}
                  >
                    {form.expedienteVinculadoId
                      ? t("agendaPage.crearOtroExpedienteDesdeCita")
                      : t("agendaPage.crearExpedienteDesdeCita")}
                  </button>
                )}
              </p>
            )}
            <div className="space-y-3">
              {form.modo === "firma" ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.expediente")} *</label>
                  {form.expedienteId ? (
                    <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2 text-sm">
                      <span className="font-medium">{form.expedienteLabel}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...form, expedienteId: null, expedienteLabel: "" });
                          setExpBusqueda("");
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={expBusqueda}
                        onChange={(e) => setExpBusqueda(e.target.value)}
                        placeholder={t("agendaPage.buscarExpediente")}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        autoFocus
                      />
                      {expResultados.length > 0 && (
                        <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                          {expResultados.map((e) => (
                            <li key={e.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    expedienteId: e.id,
                                    expedienteLabel: e.referencia || `EXP-${e.numero}`,
                                  })
                                }
                                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-cyan-50"
                              >
                                {e.referencia || `EXP-${e.numero}`}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {/* #626 — la firma de una escritura es un expediente, no una
                      cita manual: la salida se marca aquí para que valga en el
                      caso que planteaba el notario (firmar en un banco o en un
                      domicilio por enfermedad). */}
                  <div className="mt-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form.esSalida}
                        onChange={(e) => setForm({ ...form, esSalida: e.target.checked })}
                      />
                      {t("agendaPage.esSalida")}
                    </label>
                    {form.esSalida && (
                      <input
                        type="text"
                        value={form.lugar}
                        onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                        placeholder={t("agendaPage.lugarPlaceholder")}
                        maxLength={200}
                        className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                </div>
              ) : form.modo === "bloqueo" ? (
                <>
                  {/* #281 Fase 2 — motivo (opcional) + para quién. */}
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("agendaPage.motivoBloqueo")}</label>
                    <input
                      type="text"
                      value={form.titulo}
                      onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                      placeholder={t("agendaPage.motivoBloqueoPlaceholder")}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("agendaPage.paraQuien")}</label>
                    <select
                      value={form.usuarioId}
                      onChange={(e) => setForm({ ...form, usuarioId: e.target.value })}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="">{t("agendaPage.todaNotaria")}</option>
                      {empleados.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("agendaPage.tituloHito")} *</label>
                    <input
                      type="text"
                      value={form.titulo}
                      onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t("agendaPage.tipoHito")}</label>
                    <select
                      value={form.tipo}
                      onChange={(e) => setForm({ ...form, tipo: e.target.value as EventoForm["tipo"] })}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="CONSULTA">{t("agendaPage.tipoConsulta")}</option>
                      <option value="REUNION">{t("agendaPage.tipoReunion")}</option>
                      <option value="FIRMA">{t("agendaPage.tipoFirma")}</option>
                      <option value="OTRO">{t("agendaPage.tipoOtro")}</option>
                    </select>
                  </div>

                  {/* #629/#630 — Una firma apuntada en la agenda lleva empleado
                      asignado y puede ir señalada. Solo aparece al elegir
                      Firma: en una consulta o una reunión no significan nada. */}
                  {form.tipo === "FIRMA" && (
                    <div className="space-y-2 rounded-md border border-cyan-200 bg-cyan-50/50 p-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          {t("agendaPage.empleadoAsignado")}
                        </label>
                        <select
                          value={form.asignadoId}
                          onChange={(e) => setForm({ ...form, asignadoId: e.target.value })}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">{t("agendaPage.sinAsignar")}</option>
                          {empleados.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.displayName}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Los dos checks juntos, como pedía: dónde se firma y si
                          va señalada. El de salida es el mismo de #626; aquí
                          sube a esta caja para no partir la lista en dos. */}
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={form.esSalida}
                          onChange={(e) => setForm({ ...form, esSalida: e.target.checked })}
                        />
                        {t("agendaPage.esSalida")}
                      </label>
                      {form.esSalida && (
                        <input
                          type="text"
                          value={form.lugar}
                          onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                          placeholder={t("agendaPage.lugarPlaceholder")}
                          maxLength={200}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                      )}
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={form.importante}
                          onChange={(e) => setForm({ ...form, importante: e.target.checked })}
                        />
                        {t("agendaPage.firmaImportante")}
                      </label>
                    </div>
                  )}

                  {/* #626 — con QUIÉN es la cita. Sale del directorio de
                      Contactos; no hay una lista aparte que mantener. */}
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      {t("agendaPage.contacto")}
                    </label>
                    {form.contactoId ? (
                      <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2 text-sm">
                        <span className="font-medium">{form.contactoLabel}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setForm({ ...form, contactoId: null, contactoLabel: "" });
                            setContBusqueda("");
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={contBusqueda}
                          onChange={(e) => setContBusqueda(e.target.value)}
                          placeholder={t("agendaPage.buscarContacto")}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        />
                        {contResultados.length > 0 && (
                          <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                            {contResultados.map((c) => {
                              const label =
                                c.razonSocial?.trim() ||
                                `${c.nombre} ${c.apellidos || ""}`.trim();
                              return (
                                <li key={c.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setForm({ ...form, contactoId: c.id, contactoLabel: label })
                                    }
                                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-cyan-50"
                                  >
                                    {label}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <p className="mt-1 text-[11px] text-gray-500">
                          {t("agendaPage.contactoHint")}
                        </p>
                      </>
                    )}
                  </div>

                  {/* #626 — salida: el notario firma fuera del despacho (un
                      banco, un domicilio por enfermedad…). #630 — en las firmas
                      este check vive arriba, junto al de "importante"; aquí
                      queda para consultas, reuniones y otros. */}
                  <div className={form.tipo === "FIRMA" ? "hidden" : undefined}>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={form.esSalida}
                        onChange={(e) => setForm({ ...form, esSalida: e.target.checked })}
                      />
                      {t("agendaPage.esSalida")}
                    </label>
                    {form.esSalida && (
                      <input
                        type="text"
                        value={form.lugar}
                        onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                        placeholder={t("agendaPage.lugarPlaceholder")}
                        maxLength={200}
                        className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                      />
                    )}
                    <p className="mt-1 text-[11px] text-gray-500">{t("agendaPage.esSalidaHint")}</p>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.inicio")}</label>
                  <input
                    type="datetime-local"
                    value={form.inicio}
                    onChange={(e) => cambiarInicio(e.target.value)}
                    className="w-full rounded-md border px-2 py-2 text-sm"
                  />
                </div>
                {/* #650 — el Fin se ofrecía en hitos y bloqueos pero no en las
                    firmas, que son justo las que el oficial agenda a mano. */}
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.fin")}</label>
                  <input
                    type="datetime-local"
                    value={form.fin}
                    onChange={(e) => setForm({ ...form, fin: e.target.value })}
                    className="w-full rounded-md border px-2 py-2 text-sm"
                  />
                </div>
              </div>
              {form.modo === "hito" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.descripcion")}</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* #372 — visibilidad de la cita manual: pública (todos ven el
                  detalle) o privada (solo el creador; el resto ve "Ocupado"). */}
              {form.modo === "hito" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.visibilidad")}</label>
                  <div className="flex rounded-md border p-0.5 text-xs font-medium">
                    {(["PUBLICA", "PRIVADA"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setForm({ ...form, visibilidad: v })}
                        className={`flex-1 rounded px-2 py-1 ${
                          form.visibilidad === v ? "bg-cyan-600 text-white" : "text-gray-600"
                        }`}
                      >
                        {v === "PUBLICA" ? t("agendaPage.visibilidadPublica") : t("agendaPage.visibilidadPrivada")}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {form.visibilidad === "PRIVADA"
                      ? t("agendaPage.visibilidadPrivadaHint")
                      : t("agendaPage.visibilidadPublicaHint")}
                  </p>
                </div>
              )}

              {/* #281 Fase 5b — aviso BLANDO de solapes (no impide guardar). */}
              {(form.modo === "firma" || form.modo === "hito") &&
                conflictos &&
                (conflictos.bloqueos.length > 0 || conflictos.firmas.length > 0) && (
                  <div
                    className={`rounded-md border px-3 py-2 text-xs ${
                      conflictos.bloqueos.length > 0
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {conflictos.bloqueos.length > 0 && (
                      <p className="font-medium">
                        {t("agendaPage.conflictoBloqueo", { n: conflictos.bloqueos.length })}
                      </p>
                    )}
                    {conflictos.firmas.length > 0 && (
                      <p className={conflictos.bloqueos.length > 0 ? "mt-1" : "font-medium"}>
                        {t("agendaPage.conflictoFirmas", { n: conflictos.firmas.length })}
                      </p>
                    )}
                  </div>
                )}
            </div>
            {/* #650 — "al guardar no hace nada": el aviso de error vivía en la
                página, detrás del overlay del diálogo, así que un guardado
                rechazado (p. ej. una firma sin expediente) era invisible. */}
            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              {form.id ? (
                <button
                  type="button"
                  onClick={borrarEvento}
                  disabled={saving}
                  className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {t("common.delete")}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={guardarEvento}
                  disabled={
                    saving ||
                    (form.modo === "firma"
                      ? !form.expedienteId
                      : form.modo === "hito"
                        ? !form.titulo.trim()
                        : false)
                  }
                  className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* #185 (Etapa 3) — configuración del horario de firma (huecos). */}
      {horarioForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">{t("agendaPage.horarioTitle")}</h3>
            <p className="mb-3 text-xs text-gray-400">{t("agendaPage.horarioHint")}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("agendaPage.diasLaborables")}</label>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((dia, idx) => {
                    const activo = horarioForm.diasLaborables.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setHorarioForm({
                            ...horarioForm,
                            diasLaborables: activo
                              ? horarioForm.diasLaborables.filter((d) => d !== idx)
                              : [...horarioForm.diasLaborables, idx].sort(),
                          })
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                          activo
                            ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                            : "border-gray-200 bg-white text-gray-500"
                        }`}
                      >
                        {t(`agendaPage.dia.${dia}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.horaInicio")}</label>
                  <input
                    type="time"
                    value={horarioForm.horaInicio}
                    onChange={(e) => setHorarioForm({ ...horarioForm, horaInicio: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("agendaPage.horaFin")}</label>
                  <input
                    type="time"
                    value={horarioForm.horaFin}
                    onChange={(e) => setHorarioForm({ ...horarioForm, horaFin: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setHorarioForm(null)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={guardarHorario}
                disabled={saving || horarioForm.diasLaborables.length === 0}
                className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* #281 Fase 4 — feed .ics saliente: URL para suscribir desde Google/Outlook. */}
      {icsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">{t("agendaPage.icsTitle")}</h3>
            <p className="mb-3 text-xs text-gray-500">{t("agendaPage.icsHint")}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={icsUrl ?? t("common.loading")}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border bg-gray-50 px-3 py-2 font-mono text-xs"
              />
              <button
                type="button"
                disabled={!icsUrl}
                onClick={() => {
                  if (!icsUrl) return;
                  void navigator.clipboard.writeText(icsUrl).then(() => setIcsCopiado(true));
                }}
                className="shrink-0 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {icsCopiado ? t("agendaPage.icsCopiado") : t("agendaPage.icsCopiar")}
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-700">{t("agendaPage.icsSecretoAviso")}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={regenerarIcs}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                {t("agendaPage.icsRegenerar")}
              </button>
              <button
                type="button"
                onClick={() => setIcsOpen(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
