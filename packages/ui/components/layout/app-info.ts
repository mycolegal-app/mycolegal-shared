export interface AppInfo {
  slug: string;
  name: string;
  appUrl: string;
  /** Raw SVG markup (not a URL). Rendered via dangerouslySetInnerHTML. */
  logoSvg?: string | null;
  /** #835 — orden en la barra (menor primero; a igual orden, alfabético). Lo fija Admin. */
  sortOrder?: number;
}

/** #835 — comparador único de apps: `sortOrder` y, a igual orden, nombre. */
export function compareApps(a: AppInfo, b: AppInfo): number {
  const d = (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
  return d !== 0 ? d : a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}
