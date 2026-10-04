// Comparaciones numéricas en el `{{IF}}`: `<=`, `>=`, `<`, `>`.
//
// POR QUÉ CRECE EL LENGUAJE AQUÍ
//
// El `IF` sólo tenía `==`, `!=` e `IN`. Medido el 3-oct-2026: los 7 esquemas de
// cancelaciones del Banco Sabadell llevan la MISMA línea copiada,
//
//     {{IF TOTAL_RESP_CANCELADA <= 500000}}
//
// y al no soportarse, esa condición **no protegía nada**: el bloque se emitía
// siempre y un límite de responsabilidad de 500.000 € no se comprobaba. Es la
// salida «(a) el lenguaje crece» que F0.4 preveía — y crece porque una biblioteca
// fiscal va a volver a necesitar umbrales.
//
// EL PROBLEMA DE VERDAD NO ES EL OPERADOR: ES QUÉ NÚMERO SE COMPARA
//
// En una escritura el mismo importe aparece como `500000`, `500.000` o
// `500.000,00`, y en formato español el punto son miles y la coma decimales —al
// revés que en inglés—. Comparar mal un importe en un documento notarial no es
// un detalle de formato. Las reglas, explícitas:
//
//   · con punto Y coma, **manda el ÚLTIMO** como separador decimal:
//     `500.000,00` → 500000  ·  `500,000.00` → 500000
//   · sólo coma → **decimal** (es una biblioteca en español): `500,50` → 500.5
//   · sólo punto → **miles** si son grupos exactos de tres (`500.000`,
//     `1.234.567`); decimal en cualquier otro caso (`500.5`, `1.25`)
//   · se quitan el euro, los espacios y los espacios duros antes de mirar
//
// Y lo que NO se hace: adivinar. Si el valor no es un número, la comparación
// **no se da por falsa en silencio** — devuelve un problema que el compositor
// convierte en aviso. Es justo la clase de fallo mudo que esta biblioteca arrastra.

/** Los operadores que admite el `IF`. Orden significativo: los de dos
 *  caracteres van ANTES, o `<=` se partiría como `<`. */
export const OPERADORES_NUMERICOS = ['<=', '>=', '<', '>'] as const;
export type OperadorNumerico = (typeof OPERADORES_NUMERICOS)[number];

export interface AtomoComparacion {
  campo: string;
  operador: OperadorNumerico;
  /** El literal tal como está escrito, sin interpretar. */
  literal: string;
}

/** Reconoce `CAMPO <op> literal`. Devuelve `null` si el átomo no es eso.
 *
 *  Es seguro partir por la primera aparición del operador: un nombre de campo
 *  no puede llevar `<` ni `>`. */
export function parseComparacion(atom: string): AtomoComparacion | null {
  const t = atom.trim();
  for (const op of OPERADORES_NUMERICOS) {
    const i = t.indexOf(op);
    if (i <= 0) continue;
    const campo = t.slice(0, i).trim();
    const literal = t.slice(i + op.length).trim();
    if (!campo || !literal) return null;
    // El nombre tiene que ser un nombre, con el espacio de nombres `SYSTEM:`
    // opcional y los subcampos `ITEM.X` del FOR EACH.
    if (!/^(?:SYSTEM:)?[\w.À-ɏ]+$/.test(campo)) return null;
    return { campo, operador: op, literal };
  }
  return null;
}

const MONEDA = /[€$£]|\bEUR\b|\bEUROS?\b/gi;

/**
 * Convierte a número un importe escrito como lo escribe una notaría.
 *
 * Devuelve `null` si no hay número que sacar — y eso es información, no un
 * cero: quien llama debe avisar, no comparar contra 0.
 */
export function parseNumero(texto: string): number | null {
  let s = String(texto).replace(MONEDA, '').replace(/[\s\u00a0\u202f]/g, '').trim();
  if (!s) return null;
  let signo = 1;
  if (/^[+-]/.test(s)) {
    if (s[0] === '-') signo = -1;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const ultPunto = s.lastIndexOf('.');
  const ultComa = s.lastIndexOf(',');
  let entero: string;
  let decimal = '';
  let miles: string | null = null;

  if (ultPunto >= 0 && ultComa >= 0) {
    // Los dos separadores: manda el ÚLTIMO como decimal, el otro son miles.
    const corte = Math.max(ultPunto, ultComa);
    miles = corte === ultPunto ? ',' : '.';
    entero = s.slice(0, corte);
    decimal = s.slice(corte + 1);
  } else if (ultComa >= 0) {
    // Sólo coma: decimal (biblioteca en español).
    entero = s.slice(0, ultComa);
    decimal = s.slice(ultComa + 1);
  } else if (ultPunto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Sólo punto y grupos EXACTOS de tres: son miles, no hay decimales.
    entero = s;
    miles = '.';
  } else if (ultPunto >= 0) {
    // Sólo punto que no agrupa: decimal.
    entero = s.slice(0, ultPunto);
    decimal = s.slice(ultPunto + 1);
  } else {
    entero = s;
  }

  // La parte entera ha de estar bien formada: o sin separadores, o en grupos
  // exactos de tres. Sin esto, basura como `1,2,3.4.5` colaba como 1234,5 — y
  // un importe mal leído en una escritura no es un detalle de formato.
  const sueltos = entero.replace(/[.,]/g, '');
  if (!/^\d*$/.test(sueltos) || !/^\d*$/.test(decimal)) return null;
  if (/[.,]/.test(entero)) {
    if (miles === null) return null;
    const re = new RegExp(`^\\d{1,3}(\\${miles}\\d{3})+$`);
    if (!re.test(entero)) return null;
  }
  if (sueltos === '' && decimal === '') return null;

  const n = Number(`${sueltos || '0'}.${decimal || '0'}`);
  return Number.isFinite(n) ? signo * n : null;
}

export interface ResultadoComparacion {
  resultado: boolean;
  /** Por qué no se pudo comparar. Si viene, `resultado` es `false` por
   *  prudencia, pero hay que AVISAR: no es un «no se cumple». */
  problema?: string;
}

/** Compara el valor de un campo con el literal del `IF`. */
export function compararNumerico(
  valor: unknown,
  operador: OperadorNumerico,
  literal: string,
): ResultadoComparacion {
  const b = parseNumero(literal);
  if (b === null) {
    return { resultado: false, problema: `'${literal}' no es un número comparable` };
  }
  const bruto = valor === null || valor === undefined ? '' : String(valor);
  if (bruto.trim() === '') {
    // Campo sin rellenar: no se cumple, y no es un error — es que falta el dato.
    return { resultado: false };
  }
  const a = parseNumero(bruto);
  if (a === null) {
    return { resultado: false, problema: `el valor '${bruto}' no es un número comparable` };
  }
  switch (operador) {
    case '<=': return { resultado: a <= b };
    case '>=': return { resultado: a >= b };
    case '<': return { resultado: a < b };
    case '>': return { resultado: a > b };
  }
}
