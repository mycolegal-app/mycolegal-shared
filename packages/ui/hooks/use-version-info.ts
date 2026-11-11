"use client";

import { useEffect, useState } from "react";
import { pedirConCacheDeSesion } from "../lib/cache-sesion";

export interface VersionInfo {
  app: string;
  ui: string;
  /** Versión de @mycolegal-app/sharedlib (opcional: solo apps que ya lo consumen). */
  sharedlib?: string;
  auth: string;
}

// Module-level cache so the fetch only happens once per page load no matter
// how many times the modal is mounted/opened, and sessionStorage for 10 min so
// the next pages don't ask again (only changes on deploy). A failed fetch
// returns null and will be retried on the next hard navigation.
let inflight: Promise<VersionInfo | null> | null = null;

function load(): Promise<VersionInfo | null> {
  if (inflight) return inflight;
  inflight = pedirConCacheDeSesion<VersionInfo>("/api/version", { vidaMs: 10 * 60_000 })
    .then((r) => (r.ok ? r.json : null));
  return inflight;
}

export function useVersionInfo(): VersionInfo | null {
  const [data, setData] = useState<VersionInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then((v) => {
      if (!cancelled) setData(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
