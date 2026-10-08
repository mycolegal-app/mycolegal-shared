"use client";

// Respuesta hablada (F7 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md): lee en voz alta una respuesta
// de MycoBot. Pide el audio a la ruta `/api/tts` de la app, que lo trae de platform (Gemini TTS en la UE,
// voz Kore) como PCM crudo en streaming (24 kHz, mono, 16 bits), y lo va reproduciendo con Web Audio según
// llega: el primer audio suena en ~1-2 s aunque la respuesta dure un minuto.
//
// - Un solo audio a la vez en toda la página: pulsar 🔊 en otra respuesta para la anterior.
// - `parar()` corta la reproducción y la descarga (y, a través del proxy, la generación en platform).
// - Si la app no tiene la ruta, o platform dice que la voz no está disponible (modelo retirado o fuera de
//   la UE), `disponible` es false y el botón no se pinta.
// - Voz de cada usuario (F7b): `voz` es la elegida y `voces` la lista corta; `elegirVoz` la guarda en platform y
//   la cambia a la vez en todos los botones de la página; `oirMuestra` reproduce una frase de muestra.

import { useCallback, useEffect, useRef, useState } from "react";

export type EstadoVoz = "inactivo" | "preparando" | "sonando";

const RATE = 24_000;

export interface OpcionVoz { id: string; genero: "F" | "M" }
interface EstadoRuta { disponible: boolean; voz: string | null; voces: OpcionVoz[] }
const SIN_VOZ: EstadoRuta = { disponible: false, voz: null, voces: [] };

// Estado por URL, compartido entre instancias. Se renueva a los 5 minutos: si platform apaga la voz, los
// botones desaparecen sin recargar la página. Al elegir voz se avisa a todos los botones (`oyentes`).
const sondas = new Map<string, { p: Promise<EstadoRuta>; expira: number }>();
const oyentes = new Map<string, Set<(e: EstadoRuta) => void>>();
function estadoRuta(url: string): Promise<EstadoRuta> {
  const hit = sondas.get(url);
  if (hit && hit.expira > Date.now()) return hit.p;
  const p = fetch(url, { method: "GET" })
    .then(async (r) => {
      if (!r.ok) return SIN_VOZ;
      const d = ((await r.json().catch(() => null)) as { data?: Partial<EstadoRuta> } | null)?.data;
      return d?.disponible === true
        ? { disponible: true, voz: d.voz ?? null, voces: Array.isArray(d.voces) ? d.voces : [] }
        : SIN_VOZ;
    })
    .catch(() => SIN_VOZ);
  sondas.set(url, { p, expira: Date.now() + 5 * 60_000 });
  return p;
}
function publicar(url: string, e: EstadoRuta) {
  sondas.set(url, { p: Promise.resolve(e), expira: Date.now() + 5 * 60_000 });
  oyentes.get(url)?.forEach((f) => f(e));
}

/** La muestra que suena ahora (sólo una). */
let muestraSonando: HTMLAudioElement | null = null;

/** La reproducción en curso en la página (sólo una). */
let enCurso: { parar: () => void } | null = null;

export interface UseVozOpts {
  /** Ruta de la app (por defecto `/api/tts`). */
  url?: string;
  /** Desde dónde se escucha (mycobot, redactor-generacion…): sólo métricas. */
  contexto?: string;
  onError?: () => void;
}

export function useVoz(opts: UseVozOpts = {}) {
  const url = opts.url ?? "/api/tts";
  const [estado, setEstado] = useState<EstadoVoz>("inactivo");
  const [ruta, setRuta] = useState<EstadoRuta>(SIN_VOZ);
  const yo = useRef<{ parar: () => void } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const soportado =
    typeof window !== "undefined" &&
    !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) &&
    typeof ReadableStream !== "undefined";

  useEffect(() => {
    if (!soportado) return;
    let vivo = true;
    void estadoRuta(url).then((e) => vivo && setRuta(e));
    const set = oyentes.get(url) ?? new Set();
    oyentes.set(url, set);
    const oir = (e: EstadoRuta) => vivo && setRuta(e);
    set.add(oir);
    return () => { vivo = false; set.delete(oir); };
  }, [soportado, url]);

  const elegirVoz = useCallback(async (voz: string) => {
    const antes = ruta;
    publicar(url, { ...ruta, voz }); // se ve al momento; si falla, se deshace
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voz }),
    }).catch(() => null);
    if (!res?.ok) { publicar(url, antes); optsRef.current.onError?.(); }
  }, [url, ruta]);

  const oirMuestra = useCallback((voz: string, idioma?: string | null) => {
    muestraSonando?.pause();
    const a = new Audio(`${url}?muestra=${encodeURIComponent(voz)}&idioma=${encodeURIComponent(idioma ?? "")}`);
    muestraSonando = a;
    void a.play().catch(() => optsRef.current.onError?.());
  }, [url]);

  const parar = useCallback(() => {
    yo.current?.parar();
  }, []);

  // Al desmontar (cerrar el rail, cambiar de conversación) se calla.
  useEffect(() => () => yo.current?.parar(), []);

  const escuchar = useCallback(async (texto: string, idioma?: string | null) => {
    if (!soportado || !texto.trim()) return;
    enCurso?.parar();

    const corte = new AbortController();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // El contexto se crea DENTRO del clic: Safari no deja sonar un AudioContext creado fuera de un gesto.
    const ctx = new Ctx();
    const fuentes = new Set<AudioBufferSourceNode>();
    let terminado = false;
    const control = {
      parar: () => {
        if (terminado) return;
        terminado = true;
        corte.abort();
        for (const f of fuentes) { try { f.stop(); } catch { /* ya parada */ } }
        void ctx.close().catch(() => {});
        if (enCurso === control) enCurso = null;
        if (yo.current === control) yo.current = null;
        setEstado("inactivo");
      },
    };
    enCurso = control;
    yo.current = control;
    setEstado("preparando");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, idioma: idioma ?? null, contexto: optsRef.current.contexto }),
        signal: corte.signal,
      });
      if (!res.ok || !res.body) {
        if (res.status === 503 || res.status === 404) publicar(url, SIN_VOZ);
        throw new Error(`tts ${res.status}`);
      }
      const reader = res.body.getReader();
      // Cuándo empieza el siguiente trozo. Un pequeño colchón inicial evita cortes si la red titubea.
      let siguiente = ctx.currentTime + 0.15;
      let resto: Uint8Array | null = null; // byte suelto de una muestra partida entre dos trozos
      let ultima: AudioBufferSourceNode | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || terminado) break;
        let bytes = value;
        if (resto) {
          const unido = new Uint8Array(resto.length + bytes.length);
          unido.set(resto); unido.set(bytes, resto.length);
          bytes = unido; resto = null;
        }
        if (bytes.length % 2) { resto = bytes.slice(-1); bytes = bytes.subarray(0, bytes.length - 1); }
        if (!bytes.length) continue;
        const muestras = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const n = bytes.length / 2;
        const buf = ctx.createBuffer(1, n, RATE);
        const canal = buf.getChannelData(0);
        for (let i = 0; i < n; i++) canal[i] = muestras.getInt16(i * 2, true) / 32768;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        // Si la red va por detrás de la voz, se retoma desde ahora (con un respiro) en vez de amontonar.
        siguiente = Math.max(siguiente, ctx.currentTime + 0.05);
        src.start(siguiente);
        siguiente += buf.duration;
        fuentes.add(src);
        src.onended = () => fuentes.delete(src);
        ultima = src;
        setEstado("sonando");
      }
      if (terminado) return;
      if (!ultima) throw new Error("tts sin audio");
      // Termina cuando acaba de sonar el último trozo.
      ultima.onended = () => { fuentes.delete(ultima!); control.parar(); };
    } catch (err) {
      if (terminado || (err as { name?: string })?.name === "AbortError") return;
      control.parar();
      optsRef.current.onError?.();
    }
  }, [soportado, url]);

  return {
    estado, disponible: soportado && ruta.disponible, escuchar, parar,
    voz: ruta.voz, voces: ruta.voces, elegirVoz, oirMuestra,
  };
}
