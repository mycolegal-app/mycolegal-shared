"use client";

// Dictado por voz (F2 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md): graba con el
// micrófono del navegador y manda el audio a la ruta `/api/transcribe` de la app, que lo reenvía
// al servicio de transcripción de platform (Gemini en la UE). El texto vuelve por `onTexto` y
// NUNCA se envía solo (D3): quien llama lo deja en la caja para revisarlo.
//
// - Pulsar para empezar y pulsar para parar (D7); `cancelar()` descarta sin enviar.
// - Para sola a los `maxSegundos` (120 por defecto, D8).
// - Libera el micrófono al terminar (`track.stop()`), para que no quede el piloto rojo del navegador.
// - Si la app todavía no tiene la ruta montada (responde 404 a una sonda), `disponible` es false
//   y el botón no se pinta: la UI puede publicarse antes de que cada app cablee su proxy.

import { useCallback, useEffect, useRef, useState } from "react";

export type EstadoDictado = "inactivo" | "pidiendo-permiso" | "grabando" | "transcribiendo";
export type AvisoDictado =
  | "permisoDenegado" | "sinVoz" | "demasiadoLargo" | "formatoNoAdmitido" | "noDisponible" | "error";

/** Formatos medidos en la F0, por orden de preferencia (Chrome/Edge/Firefox → Safari). */
const FORMATOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

// Sonda de disponibilidad por URL, compartida entre instancias y cacheada en la sesión.
const sondas = new Map<string, Promise<boolean>>();
function rutaDisponible(url: string): Promise<boolean> {
  let p = sondas.get(url);
  if (!p) {
    // La ruta sólo acepta POST: si existe responde 405 a un GET; si no está montada, 404.
    p = fetch(url, { method: "GET" }).then((r) => r.status !== 404).catch(() => false);
    sondas.set(url, p);
  }
  return p;
}

function aBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export interface UseDictadoOpts {
  /** Ruta de la app (por defecto `/api/transcribe`). */
  url?: string;
  /** Idioma de la interfaz: pista para el modelo, no restricción (D9). */
  idioma?: string;
  /** Desde dónde se dicta (mycobot, redactor-generacion…): sólo métricas. */
  contexto?: string;
  maxSegundos?: number;
  onTexto: (texto: string) => void;
  onAviso?: (aviso: AvisoDictado | null) => void;
}

export function useDictado(opts: UseDictadoOpts) {
  const url = opts.url ?? "/api/transcribe";
  const maxSegundos = opts.maxSegundos ?? 120;
  const [estado, setEstado] = useState<EstadoDictado>("inactivo");
  const [segundos, setSegundos] = useState(0);
  const [disponible, setDisponible] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cancelado = useRef(false);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const soportado =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!soportado) return;
    let vivo = true;
    void rutaDisponible(url).then((ok) => vivo && setDisponible(ok));
    return () => { vivo = false; };
  }, [soportado, url]);

  const liberar = useCallback(() => {
    if (reloj.current) clearInterval(reloj.current);
    reloj.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => liberar, [liberar]);

  const enviar = useCallback(async (blob: Blob, mimeType: string) => {
    setEstado("transcribiendo");
    try {
      const audioBase64 = await aBase64(blob);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType, idioma: optsRef.current.idioma, contexto: optsRef.current.contexto }),
      });
      if (!res.ok) {
        optsRef.current.onAviso?.(
          res.status === 413 ? "demasiadoLargo"
            : res.status === 400 ? "formatoNoAdmitido"
              : res.status === 404 ? "noDisponible" : "error",
        );
        if (res.status === 404) setDisponible(false);
        return;
      }
      const j = (await res.json().catch(() => null)) as { data?: { texto?: string } } | null;
      const texto = (j?.data?.texto ?? "").trim();
      if (!texto) optsRef.current.onAviso?.("sinVoz");
      else optsRef.current.onTexto(texto);
    } catch {
      optsRef.current.onAviso?.("error");
    } finally {
      setEstado("inactivo");
      setSegundos(0);
    }
  }, [url]);

  const empezar = useCallback(async () => {
    if (!soportado || estado !== "inactivo") return;
    optsRef.current.onAviso?.(null);
    setEstado("pidiendo-permiso");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      liberar();
      setEstado("inactivo");
      optsRef.current.onAviso?.((err as DOMException)?.name === "NotAllowedError" ? "permisoDenegado" : "error");
      return;
    }
    const mimeType = FORMATOS.find((f) => MediaRecorder.isTypeSupported?.(f)) ?? "";
    const rec = new MediaRecorder(stream.current, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 32_000,
    });
    recorder.current = rec;
    trozos.current = [];
    cancelado.current = false;
    rec.ondataavailable = (e) => { if (e.data.size) trozos.current.push(e.data); };
    rec.onstop = () => {
      const tipo = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(trozos.current, { type: tipo });
      liberar();
      if (cancelado.current || !blob.size) { setEstado("inactivo"); setSegundos(0); return; }
      void enviar(blob, tipo);
    };
    rec.start();
    setSegundos(0);
    setEstado("grabando");
    const inicio = Date.now();
    reloj.current = setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(s);
      if (s >= maxSegundos && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
  }, [soportado, estado, liberar, enviar, maxSegundos]);

  const parar = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancelar = useCallback(() => {
    cancelado.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else { liberar(); setEstado("inactivo"); setSegundos(0); }
  }, [liberar]);

  return { estado, segundos, soportado, disponible: soportado && disponible, empezar, parar, cancelar, maxSegundos };
}
