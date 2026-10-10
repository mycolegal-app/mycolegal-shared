// EL XML DEL ÍNDICE ÚNICO A PARTIR DE UN MODELO (plan REQ_CATALOGO_IUI, F5.1; 10-oct-2026).
//
// En el XML del CTN la operación NO contiene a los sujetos ni a los objetos: los CITA. Los sujetos
// van en `SUJS/SUJ` (con `IDE_SUJ`), los objetos en `OBJS/OBJ` (con `IDE_OBJ`), y cada operación
// (`OPES/OPE`, con su `ACT_JUR`) dice qué sujetos son de cada clase (`PRI…CUA_CLA_OTOS`, por
// `ID_SUJ`) y qué objetos intervienen (`OBJS_INT/OBJ_INT`, por `ID_OBJ`), con los derechos de cada
// sujeto sobre cada objeto dentro (`PRI_CLA_OTOS2/PRI_CLA_OTO2/DER`). Este módulo recibe ese modelo
// —quien lo arma sabe de dónde sale cada valor; aquí no se sabe nada de esquemas ni de catálogos— y
// lo serializa en el ORDEN del XSD, comprobando lo que el índice de rutas permite comprobar:
//
//   · la ruta existe (si no, se descarta y se avisa);
//   · el código está entre los admitidos;
//   · las fechas van en `aaaa-mm-dd` y los importes con punto decimal (se convierten desde la forma
//     española);
//   · de una elección (`xs:choice`) sólo va una rama;
//   · lo obligatorio dentro de lo que se ha escrito está (si falta, se avisa: el XML no validaría).
//
// Vale para cualquier acto: el acto sólo pone el `ACT_JUR` y las clases. Sin dependencias; la
// validación contra el XSD completo es de los tests (`xmllint`).
import { RUTAS_CTN, type RutaCtn } from './rutas-ctn';
import { IUI_NAMESPACE } from './generar';

/** Un valor del XML: su ruta RELATIVA al contenedor (puede llevar índices, `PAG[2]/MED_PAG`). */
export interface EntradaIui { ruta: string; valor: string }

export interface SujetoIui { id: number; entradas: EntradaIui[] }
export interface ObjetoIui { id: number; entradas: EntradaIui[] }

/** Un objeto que interviene en la operación, con lo de cada sujeto de cada clase sobre él (su derecho). */
export interface ObjetoIntervinienteIui {
  objeto: number;
  entradas: EntradaIui[];
  /** Por clase (0 = primera … 3 = cuarta): los sujetos con sus entradas relativas a `PRI_CLA_OTO2`. */
  clases: { sujeto: number; entradas: EntradaIui[] }[][];
}

export interface OperacionIui {
  /** Código del acto jurídico (`ACT_JUR`). */
  acto: string;
  entradas: EntradaIui[];
  /** Hasta cuatro clases de otorgantes, cada una con los ids de sus sujetos. */
  clases: { sujetos: number[]; descripcion?: string }[];
  objetos: ObjetoIntervinienteIui[];
}

export interface ModeloIui {
  /** Bajo `IDE_DOC`: fecha y número de protocolo, lugar de autorización… */
  documento: EntradaIui[];
  sujetos: SujetoIui[];
  objetos: ObjetoIui[];
  operaciones: OperacionIui[];
}

export interface ResultadoIui {
  xml: string;
  /** Lo que no ha podido escribirse tal cual, o lo que falta para que valide. */
  avisos: string[];
}

const CLASES = ['PRI', 'SEG', 'TER', 'CUA'];
const RAIZ_DOC = 'DOCS_NOT/DOC_NOT';

interface Nodo { tag: string; ruta: string; hijos: Nodo[]; texto?: string }
const nuevo = (tag: string, ruta: string): Nodo => ({ tag, ruta, hijos: [] });

/** La ruta canónica (sin índices) de un hijo. */
const unir = (padre: string, tag: string) => (padre ? `${padre}/${tag}` : tag);

/** `25/12/2026` → `2026-12-25`; deja lo que ya es ISO; `null` si no es una fecha. */
export function fechaIso(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** `250.000,50` → `250000.50`; `250000` igual; `null` si no es un número. */
export function decimalXsd(v: string): string | null {
  const s = v.trim().replace(/\s|€/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s)) return s.replace(/\./g, '').replace(',', '.');
  return null;
}

export function serializarIui(modelo: ModeloIui, opciones: {
  generador?: { producto: string; aplicacion: string; version: string };
  indentar?: string | null;
  rutas?: Record<string, RutaCtn>;
} = {}): ResultadoIui {
  const rutas = opciones.rutas ?? RUTAS_CTN;
  const avisos: string[] = [];
  const raiz = nuevo('DOCS_NOT', 'DOCS_NOT');

  /** El hijo `tag` (el `indice`-ésimo, 1-based) de `padre`, creándolo y los anteriores si faltan. */
  const hijo = (padre: Nodo, tag: string, indice: number | null = null): Nodo => {
    const ruta = unir(padre.ruta, tag);
    const mismos = padre.hijos.filter((h) => h.tag === tag);
    if (indice === null) {
      if (mismos[0]) return mismos[0];
      const n = nuevo(tag, ruta);
      padre.hijos.push(n);
      return n;
    }
    for (let i = mismos.length; i < indice; i++) {
      const n = nuevo(tag, ruta);
      padre.hijos.push(n);
      mismos.push(n);
    }
    return mismos[indice - 1];
  };
  /** Un hijo NUEVO `tag` (para los repetidos: un sujeto, una clase…). */
  const otro = (padre: Nodo, tag: string): Nodo => {
    const n = nuevo(tag, unir(padre.ruta, tag));
    padre.hijos.push(n);
    return n;
  };

  /** Escribe `valor` en `ruta` bajo `base`, comprobándolo contra el índice. */
  const poner = (base: Nodo, ruta: string, valor: string, donde: string) => {
    const segs = ruta.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    let actual = base;
    for (let i = 0; i < segs.length; i++) {
      const m = segs[i].match(/^([A-Z0-9_]+)(?:\[(\d+)\])?$/);
      if (!m) { avisos.push(`${donde}: ruta mal formada «${ruta}»`); return; }
      const canon = unir(actual.ruta, m[1]);
      const r = rutas[canon];
      if (!r) { avisos.push(`${donde}: «${canon.replace(`${RAIZ_DOC}/`, '')}» no existe en el XSD`); return; }
      if (i === segs.length - 1) {
        if (!r.h) { avisos.push(`${donde}: «${m[1]}» no lleva valor, sólo elementos`); return; }
        const v = normalizar(valor, r);
        if (v === null) { avisos.push(`${donde}: «${valor}» no vale para ${m[1]}${r.e ? ` (admite ${r.e.join(', ')})` : r.b ? ` (${r.b})` : ''}`); return; }
        const n = hijo(actual, m[1], m[2] ? Number(m[2]) : null);
        n.texto = v;
        return;
      }
      actual = hijo(actual, m[1], m[2] ? Number(m[2]) : null);
    }
  };
  const ponerTodas = (base: Nodo, entradas: EntradaIui[], donde: string) => {
    for (const e of entradas) if (e.valor !== '' && e.valor != null) poner(base, e.ruta, e.valor, donde);
  };

  // ── el documento ──────────────────────────────────────────────────────────
  const g = opciones.generador ?? { producto: 'MycoLegalTech', aplicacion: 'Redactor', version: '1' };
  const gen = hijo(raiz, 'GEN_DAT');
  poner(gen, 'NOM_PRO', g.producto, 'generador');
  poner(gen, 'NOM_APL', g.aplicacion, 'generador');
  poner(gen, 'VER_APL', g.version, 'generador');
  const doc = hijo(raiz, 'DOC_NOT');
  if (modelo.documento.length) ponerTodas(hijo(doc, 'IDE_DOC'), modelo.documento, 'documento');

  // ── sujetos y objetos ─────────────────────────────────────────────────────
  if (modelo.sujetos.length) {
    const sujs = hijo(doc, 'SUJS');
    poner(sujs, 'NUM_SUJS', String(modelo.sujetos.length), 'sujetos');
    for (const s of modelo.sujetos) {
      const n = otro(sujs, 'SUJ');
      poner(n, 'IDE_SUJ', String(s.id), `sujeto ${s.id}`);
      ponerTodas(n, s.entradas, `sujeto ${s.id}`);
    }
  }
  if (modelo.objetos.length) {
    const objs = hijo(doc, 'OBJS');
    poner(objs, 'NUM_OBJS', String(modelo.objetos.length), 'objetos');
    for (const o of modelo.objetos) {
      const n = otro(objs, 'OBJ');
      poner(n, 'IDE_OBJ', String(o.id), `objeto ${o.id}`);
      ponerTodas(n, o.entradas, `objeto ${o.id}`);
    }
  }

  // ── las operaciones ───────────────────────────────────────────────────────
  if (modelo.operaciones.length) {
    const opes = hijo(doc, 'OPES');
    poner(opes, 'NUM_OPES', String(modelo.operaciones.length), 'operaciones');
    modelo.operaciones.forEach((op, k) => {
      const donde = `operación ${k + 1}`;
      const n = otro(opes, 'OPE');
      poner(n, 'ACT_JUR', op.acto, donde);
      ponerTodas(n, op.entradas, donde);
      op.clases.slice(0, 4).forEach((c, i) => {
        if (!c.sujetos.length) return;
        const cl = hijo(n, `${CLASES[i]}_CLA_OTOS`);
        if (c.descripcion) poner(cl, 'DES_INT', c.descripcion, donde);
        for (const s of c.sujetos) poner(otro(cl, `${CLASES[i]}_CLA_OTO`), 'ID_SUJ', String(s), donde);
      });
      if (op.objetos.length) {
        const oi = hijo(n, 'OBJS_INT');
        poner(oi, 'NUM_OBJS_INT', String(op.objetos.length), donde);
        for (const o of op.objetos) {
          const no = otro(oi, 'OBJ_INT');
          poner(no, 'ID_OBJ', String(o.objeto), `${donde}, objeto ${o.objeto}`);
          ponerTodas(no, o.entradas, `${donde}, objeto ${o.objeto}`);
          o.clases.slice(0, 4).forEach((suyos, i) => {
            if (!suyos.length) return;
            const cl = hijo(no, `${CLASES[i]}_CLA_OTOS2`);
            for (const s of suyos) {
              const ns = otro(cl, `${CLASES[i]}_CLA_OTO2`);
              poner(ns, 'ID_SUJ', String(s.sujeto), `${donde}, objeto ${o.objeto}`);
              ponerTodas(ns, s.entradas, `${donde}, objeto ${o.objeto}, sujeto ${s.sujeto}`);
            }
          });
        }
      }
    });
  }

  ordenarYComprobar(raiz, rutas, avisos);
  const indentar = opciones.indentar === undefined ? '  ' : opciones.indentar;
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n${escribir(raiz, indentar, 0, true)}`, avisos };
}

/** El valor como lo quiere el XSD, o `null` si no vale. */
function normalizar(valor: string, r: RutaCtn): string | null {
  const v = String(valor).trim();
  if (!v || /\[NO DISPONIBLE\]/.test(v)) return null;
  if (r.e) return r.e.includes(v) ? v : null;
  if (r.b === 'xs:date') return fechaIso(v);
  if (r.b === 'xs:decimal') return decimalXsd(v);
  if (r.b && /^xs:(unsigned)?(int|integer|long|short|byte|positiveInteger|nonNegativeInteger)$/i.test(r.b)) {
    const d = decimalXsd(v);
    return d !== null && /^-?\d+$/.test(d) ? d : null;
  }
  return v;
}

/** Ordena cada nivel como manda el XSD y avisa de elecciones dobles y obligatorios ausentes. */
function ordenarYComprobar(n: Nodo, rutas: Record<string, RutaCtn>, avisos: string[]): void {
  const pos = (h: Nodo) => rutas[h.ruta]?.p ?? 9999;
  // Estable: los repetidos (dos SUJ) conservan su orden.
  n.hijos = n.hijos.map((h, i) => ({ h, i })).sort((a, b) => pos(a.h) - pos(b.h) || a.i - b.i).map((x) => x.h);
  const corta = (r: string) => r.replace(`${RAIZ_DOC}/`, '');
  // Elecciones: de cada `xs:choice`, una sola rama.
  const elegidas = new Map<string, string>();
  n.hijos = n.hijos.filter((h) => {
    const c = rutas[h.ruta]?.c;
    if (!c) return true;
    const ya = elegidas.get(c);
    if (ya && ya !== h.tag) { avisos.push(`«${corta(h.ruta)}» y «${ya}» se excluyen: va sólo «${ya}»`); return false; }
    elegidas.set(c, h.tag);
    return true;
  });
  // Obligatorios: los hijos con mínimo 1 de lo que sí se ha escrito.
  if (n.hijos.length || n.texto === undefined) {
    const prefijo = `${n.ruta}/`;
    for (const [ruta, r] of Object.entries(rutas)) {
      if (!ruta.startsWith(prefijo) || ruta.slice(prefijo.length).includes('/') || r.n < 1) continue;
      const tag = ruta.slice(prefijo.length);
      if (r.c && [...elegidas.keys()].includes(r.c)) continue;
      if (!n.hijos.some((h) => h.tag === tag)) avisos.push(`falta «${corta(ruta)}», obligatorio en «${corta(n.ruta)}»`);
    }
  }
  for (const h of n.hijos) ordenarYComprobar(h, rutas, avisos);
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function escribir(n: Nodo, indentar: string | null, nivel: number, raiz = false): string {
  const pad = indentar === null ? '' : indentar.repeat(nivel);
  const nl = indentar === null ? '' : '\n';
  const ns = raiz ? ` xmlns="${IUI_NAMESPACE}"` : '';
  if (!n.hijos.length) {
    const t = n.texto === undefined ? '' : escapar(n.texto);
    return t ? `${pad}<${n.tag}${ns}>${t}</${n.tag}>${nl}` : `${pad}<${n.tag}${ns}/>${nl}`;
  }
  return `${pad}<${n.tag}${ns}>${nl}${n.hijos.map((h) => escribir(h, indentar, nivel + 1)).join('')}${pad}</${n.tag}>${nl}`;
}
