// Qué dice un valor del campo del catálogo, y qué dice el catálogo del campo.
//
// Reglas (`PLAN_TECNICO_REQ_CATALOGO_IUI.md`, DC3):
// - Sin mapa, los valores tienen que coincidir (se comparan normalizados).
// - Con mapa, sólo implican algo los valores que aparecen: un valor del campo que no está en
//   el mapa no dice nada del hecho.
// - **La dirección no se declara, se deduce del mapa.** Del campo al catálogo, siempre. Del
//   catálogo al campo, sólo cuando CADA valor del hecho vuelve a un ÚNICO valor del campo.
//   «No hay cargas» = `TIENE_HIPOTECA` falso, pero `TIENE_HIPOTECA` falso no dice que no haya
//   cargas: ese mapa (`No=FALSE`) no tiene vuelta.

import type { ReqDecl } from '../syntax/req-doc';

const VERDADERO = new Set(['TRUE', 'SI', 'S', 'YES', '1', 'VERDADERO']);
const FALSO = new Set(['FALSE', 'NO', 'N', '0', 'FALSO']);

/** Forma comparable de un valor: sin tildes, en mayúsculas, con espacios y guiones bajos
 *  equivalentes, y los booleanos reducidos a `TRUE`/`FALSE` (`Sí` = `SI` = `TRUE`). */
export function normalizarValor(v: unknown): string {
  const s = String(v ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .trim()
    .replace(/[\s_]+/g, '_');
  if (VERDADERO.has(s)) return 'TRUE';
  if (FALSO.has(s)) return 'FALSE';
  return s;
}

export interface Implicacion {
  ref: string;
  rol: string | null;
  /** Tal como lo escribe el mapa o, sin mapa, el valor del campo (normalizado si el hecho
   *  tiene opciones y una casa). */
  valor: string;
}

/** Valores posibles de un hecho del catálogo, para decidir si un mapa tiene vuelta. */
export interface HechoConOpciones {
  tipoDato: string;
  opciones?: string[] | null;
}

function valoresDelHecho(hecho: HechoConOpciones | undefined): string[] | null {
  if (!hecho) return null;
  if (hecho.tipoDato === 'BOOL') return ['TRUE', 'FALSE'];
  if (hecho.opciones?.length) return hecho.opciones.map(normalizarValor);
  return null;
}

/** Campo → catálogo: lo que implica que el campo valga `valor`. */
export function implicaciones(
  req: ReqDecl[],
  valor: unknown,
  catalogo?: (ref: string) => HechoConOpciones | undefined,
): Implicacion[] {
  const n = normalizarValor(valor);
  if (!n) return [];
  const out: Implicacion[] = [];
  for (const r of req) {
    if (!r.ref) continue;
    if (r.mapa) {
      for (const [campo, cat] of r.mapa) {
        if (normalizarValor(campo) === n) out.push({ ref: r.ref, rol: r.rol, valor: cat });
      }
      continue;
    }
    // Sin mapa: el mismo valor. Si el hecho tiene opciones, el valor tiene que ser una de
    // ellas (y se devuelve con su forma del catálogo); si no lo es, no dice nada.
    const hecho = catalogo?.(r.ref);
    const posibles = hecho?.opciones?.length ? hecho.opciones : null;
    if (posibles) {
      const casa = posibles.find((o) => normalizarValor(o) === n);
      if (casa !== undefined) out.push({ ref: r.ref, rol: r.rol, valor: casa });
    } else {
      out.push({ ref: r.ref, rol: r.rol, valor: hecho?.tipoDato === 'BOOL' ? n : String(valor) });
    }
  }
  return out;
}

/**
 * ¿Tiene vuelta este `:REQ`? Sí cuando no hay mapa, o cuando cada valor del hecho aparece en
 * el mapa con un único valor del campo. Sin saber los valores del hecho (catálogo ausente y
 * mapa no booleano), no se puede asegurar: `false`.
 */
export function tieneVuelta(r: ReqDecl, hecho?: HechoConOpciones): boolean {
  if (!r.ref) return false;
  if (!r.mapa) return true;
  const delMapa = r.mapa.map(([, c]) => normalizarValor(c));
  const valores =
    valoresDelHecho(hecho) ??
    (delMapa.every((v) => v === 'TRUE' || v === 'FALSE') ? ['TRUE', 'FALSE'] : null);
  if (!valores) return false;
  return valores.every((v) => {
    const campos = new Set(
      r.mapa!.filter(([, c]) => normalizarValor(c) === v).map(([campo]) => normalizarValor(campo)),
    );
    return campos.size === 1;
  });
}

/**
 * Catálogo → campo: el valor del campo que se deduce de que el hecho `r.ref` valga
 * `valorCatalogo`, o `null` si el mapa no tiene vuelta o el valor no está en él.
 *
 * `opcionesCampo`, si el campo tiene valores cerrados, para devolverlo con su forma exacta.
 */
export function inversa(
  r: ReqDecl,
  valorCatalogo: unknown,
  { hecho, opcionesCampo }: { hecho?: HechoConOpciones; opcionesCampo?: string[] } = {},
): string | null {
  if (!tieneVuelta(r, hecho)) return null;
  const n = normalizarValor(valorCatalogo);
  let candidato: string | null;
  if (r.mapa) {
    candidato = r.mapa.find(([, c]) => normalizarValor(c) === n)?.[0] ?? null;
  } else {
    candidato = String(valorCatalogo);
  }
  if (candidato === null) return null;
  if (opcionesCampo?.length) {
    const nc = normalizarValor(candidato);
    return opcionesCampo.find((o) => normalizarValor(o) === nc) ?? null;
  }
  return candidato;
}
