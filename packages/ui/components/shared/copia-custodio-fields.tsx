"use client";

import type { ReactNode } from "react";
import { NotarioPicker } from "./notario-picker";
import { useI18n } from "../i18n/i18n-context";
import {
  COPIA_MODOS,
  COPIA_SUBTIPOS_POR_MODO,
  ENTIDAD_ORIGEN_OTRA,
  ENTIDAD_ORIGEN_SABADELL,
  conModo,
  esCopiaParcial,
  type CopiaAltaValues,
} from "../../lib/copia-alta";

/**
 * #872 — Bloque «Datos de la copia a notario custodio». El MISMO en el Portal
 * (gestoría, banco, asesor) y en Tramitación (la notaría): antes eran dos
 * formularios escritos aparte y cada cambio se quedaba en uno solo. Valores,
 * reglas y envío viven en `lib/copia-alta`.
 *
 * Lo que es de cada pantalla entra por props: de dónde salen los notarios, si se
 * piden las referencias de la entidad (#835), la ayuda del SEDAS (cada app
 * comprueba el feed a su manera) y un hueco al final para lo que solo tiene una
 * de las dos (la notaría: canal, protocolo propio, gestoría o asesor).
 */
export interface CopiaCustodioFieldsProps {
  value: CopiaAltaValues;
  onChange: (v: CopiaAltaValues) => void;
  /** #835 — SEDAS, GCR y código de servicio de la entidad. */
  refsEntidadVisibles: boolean;
  /** Endpoint del NotarioPicker (el Portal acota a autorizantes). */
  notarioApiBase?: string;
  /** Debajo de las referencias SEDAS (validación contra el feed). */
  sedasAyuda?: ReactNode;
  /** Al final del bloque, campos propios de la pantalla. */
  children?: ReactNode;
}

const inputCls = "w-full rounded-md border px-2 py-1.5 text-sm";
const labelCls = "mb-1 block text-xs font-medium";

export function CopiaCustodioFields({
  value: v,
  onChange,
  refsEntidadVisibles,
  notarioApiBase = "/api/notarios",
  sedasAyuda,
  children,
}: CopiaCustodioFieldsProps) {
  const { t } = useI18n();
  const set = <K extends keyof CopiaAltaValues>(k: K, x: CopiaAltaValues[K]) => onChange({ ...v, [k]: x });

  return (
    <div className="space-y-3 rounded-lg border border-mc-action-100 bg-mc-action-50/40 p-3">
      <p className="text-xs font-medium text-mc-action-800">{t("copiaCustodio.bloqueTitulo")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t("copiaCustodio.tipoSolicitud")}</label>
          <select value={v.modo} onChange={(e) => onChange(conModo(v, e.target.value))} className={inputCls}>
            {COPIA_MODOS.map((m) => <option key={m} value={m}>{t(`copiaCustodio.modo.${m}`)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("copiaCustodio.subtipo")}</label>
          {v.modo === "CEE" ? (
            // Sub-rama CEE: el subtipo decide el documento; el tipoCopia queda fijo.
            <select value={v.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)} className={inputCls}>
              <option value="ESCRITURA">{t("copiaCustodio.ceeRama.ESCRITURA")}</option>
              <option value="POLIZA">{t("copiaCustodio.ceeRama.POLIZA")}</option>
            </select>
          ) : (
            <select value={v.tipoCopia} onChange={(e) => set("tipoCopia", e.target.value)} className={inputCls}>
              {(COPIA_SUBTIPOS_POR_MODO[v.modo] ?? []).map((c) => <option key={c} value={c}>{t(`copiaCustodio.copia.${c}`)}</option>)}
            </select>
          )}
        </div>
      </div>
      {/* #840 — pegado al subtipo, que es quien lo hace aparecer. */}
      {esCopiaParcial(v) && (
        <div>
          <label className={labelCls}>{t("copiaCustodio.parteParcial")} *</label>
          <textarea
            value={v.parteParcial}
            onChange={(e) => set("parteParcial", e.target.value)}
            rows={2}
            maxLength={1000}
            className={inputCls}
          />
          <p className="mt-1 text-xs font-medium text-amber-700">{t("copiaCustodio.parteParcialHint")}</p>
        </div>
      )}
      <NotarioPicker
        label={t("copiaCustodio.notario")}
        required
        value={v.notarioAutorizante}
        onChange={(text, match) => onChange({ ...v, notarioAutorizante: text, notarioAutorizanteId: match?.id ?? null })}
        apiBase={notarioApiBase}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{v.tipoDocumento === "POLIZA" ? t("copiaCustodio.asiento") : t("copiaCustodio.protocolo")}</label>
          <input value={v.protocoloAsiento} onChange={(e) => set("protocoloAsiento", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t("copiaCustodio.fecha")}</label>
          <input type="date" value={v.fechaProtocolo} onChange={(e) => set("fechaProtocolo", e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{t("copiaCustodio.referencia")}</label>
        <input value={v.referenciaPropia} onChange={(e) => set("referenciaPropia", e.target.value)} className={inputCls} />
      </div>
      {/* #415 */}
      <div>
        <label className={labelCls}>{t("copiaCustodio.concepto")}</label>
        <input value={v.concepto} onChange={(e) => set("concepto", e.target.value)} className={inputCls} />
      </div>
      {/* #23 — entre Concepto y SEDAS. */}
      <div>
        <label className={labelCls}>
          {t("copiaCustodio.entidadOrigen")} <span className="text-red-500">*</span>
        </label>
        <select value={v.entidadOrigen} onChange={(e) => set("entidadOrigen", e.target.value)} className={inputCls}>
          <option value="">{t("copiaCustodio.entidadOrigenPlaceholder")}</option>
          <option value={ENTIDAD_ORIGEN_SABADELL}>{ENTIDAD_ORIGEN_SABADELL}</option>
          <option value={ENTIDAD_ORIGEN_OTRA}>{t("copiaCustodio.entidadOrigenOtra")}</option>
        </select>
      </div>
      {/* #835 — referencias internas de la entidad: solo por cuenta del banco. */}
      {refsEntidadVisibles && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t("copiaCustodio.sedasOficina")}</label>
              <input value={v.sedasOficina} onChange={(e) => set("sedasOficina", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("copiaCustodio.sedasExpediente")}</label>
              <input value={v.sedasExpediente} onChange={(e) => set("sedasExpediente", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("copiaCustodio.sedasAutos")}</label>
              <input value={v.sedasAutos} onChange={(e) => set("sedasAutos", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("copiaCustodio.gcr")}</label>
              <input value={v.gcr} onChange={(e) => set("gcr", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("copiaCustodio.codigoServicio")}</label>
              <input value={v.codigoServicio} onChange={(e) => set("codigoServicio", e.target.value)} className={inputCls} />
            </div>
          </div>
          {sedasAyuda}
        </>
      )}
      {/* #4 / #19 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t("copiaCustodio.titular")}</label>
          <input value={v.titularOriginal} onChange={(e) => set("titularOriginal", e.target.value)} className={inputCls} />
          <p className="mt-0.5 text-[11px] text-gray-500">{t("copiaCustodio.titularHint")}</p>
        </div>
        <div>
          <label className={labelCls}>{t("copiaCustodio.titularNif")}</label>
          <input value={v.titularOriginalNif} onChange={(e) => set("titularOriginalNif", e.target.value)} className={inputCls} />
        </div>
      </div>
      {children}
    </div>
  );
}
