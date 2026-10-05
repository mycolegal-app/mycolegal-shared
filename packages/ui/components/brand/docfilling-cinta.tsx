"use client";

// La cinta «Powered by DocFilling» (rename a Redactor, decisiones M1–M4).
//
// La marca DocFilling aparece SÓLO aquí: en el modal de la escritura y, con su
// gemela HTML (`sharedlib/server/cinta-docfilling.ts`), en los informes. Es
// siempre igual —banda azul marino de la marca con el logo para fondo oscuro—,
// así que no tiene props de color. No va en la escritura (.docx), que lleva el
// membrete de la notaría.
import { DOCFILLING_LOGO_DARK } from "./docfilling-logo-dark";

export const AZUL_MARINO_DOCFILLING = "#102B60";

export function DocFillingCinta({ className = "" }: { className?: string }) {
  const [, , w, h] = DOCFILLING_LOGO_DARK.viewBox.split(" ").map(Number);
  return (
    <div
      className={`flex items-center justify-end gap-2 px-4 py-2 ${className}`}
      style={{ backgroundColor: AZUL_MARINO_DOCFILLING, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <span className="text-[11px] font-medium tracking-wide text-white/80">Powered by</span>
      <svg viewBox={DOCFILLING_LOGO_DARK.viewBox} role="img" aria-label="DocFilling" style={{ height: 18, width: (18 * w) / h }}>
        {DOCFILLING_LOGO_DARK.paths.map((p, i) => (
          <path key={i} fill={p.fill} fillRule="evenodd" d={p.d} />
        ))}
      </svg>
    </div>
  );
}
