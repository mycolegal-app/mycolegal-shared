// LOS FORMATOS DE SALIDA DE UN CAMPO: `{{CAMPO#formato}}` (14-oct-2026).
//
// El dato se guarda como llega (`3210`, `180000`, `2026-10-14`) y la PLANTILLA decide cómo se
// escribe en cada sitio: `{{FINCA#thousands}}` → «3.210», `{{PRECIO#amount}}` → «180.000,00»,
// `{{PRECIO#amount_words}}` → «ciento ochenta mil euros». Antes el formato se pedía a la IA en la
// instrucción del campo («sólo la cifra, sin euros», «en letra») y salía a veces sí y a veces no: en
// la certificación del 0507 la misma finca salió «3.210» en una pasada y «3210» en la siguiente.
// Ahora lo aplica el motor, igual siempre.
//
// Los nombres van en inglés (decisión de Carles) y la lista es CERRADA: el validador avisa de un
// formato que no existe, como de una condición mal escrita. Se encadenan de izquierda a derecha:
// `{{NOMBRE#upper}}`, `{{PRECIO#amount_words#upper}}`. Con `#` y no con `|`, que ya separa
// las opciones de `AUTO` y de `:INPUT` y el `|ENUM` de los bucles (Carles, 14-oct).
//
// Se escribe en el idioma de la plantilla (`{{LANG=xx}}`): castellano o catalán. Lo demás sale en
// castellano, como las fechas del motor.
//
// Si el valor no se deja leer como lo que el formato espera (un número, una fecha), sale TAL CUAL y
// se avisa: un dato de prueba o un texto libre no debe romper la escritura ni inventarse una cifra.

import { parseNumero } from '../syntax/comparar';

export interface DefFormato {
  /** Qué hace, para el manual y el editor. */
  descripcion: string;
  /** Ejemplo de entrada → salida (castellano). */
  ejemplo: [string, string];
}

export const FORMATOS: Record<string, DefFormato> = {
  thousands: { descripcion: 'Número con punto de miles; los decimales, como vengan', ejemplo: ['3210', '3.210'] },
  amount: { descripcion: 'Importe con punto de miles y dos decimales', ejemplo: ['180000', '180.000,00'] },
  amount_words: { descripcion: 'Importe en letra, con «euros» y los céntimos', ejemplo: ['180000,50', 'ciento ochenta mil euros con cincuenta céntimos'] },
  words: { descripcion: 'Número en letra', ejemplo: ['3', 'tres'] },
  percent: { descripcion: 'Porcentaje en cifra, con el signo separado por un espacio', ejemplo: ['50', '50 %'] },
  percent_words: { descripcion: 'Porcentaje en letra', ejemplo: ['50', 'cincuenta por ciento'] },
  date: { descripcion: 'Fecha en número', ejemplo: ['2026-10-14', '14/10/2026'] },
  date_long: { descripcion: 'Fecha con el mes en letra', ejemplo: ['2026-10-14', '14 de octubre de 2026'] },
  date_words: { descripcion: 'Fecha íntegra en letra', ejemplo: ['2026-10-14', 'catorce de octubre de dos mil veintiséis'] },
  upper: { descripcion: 'En mayúsculas', ejemplo: ['Ana Pérez', 'ANA PÉREZ'] },
  lower: { descripcion: 'En minúsculas', ejemplo: ['Separación de Bienes', 'separación de bienes'] },
  capitalize: { descripcion: 'Primera letra en mayúscula', ejemplo: ['gananciales', 'Gananciales'] },
};

export const esFormato = (nombre: string) => Object.prototype.hasOwnProperty.call(FORMATOS, nombre.trim().toLowerCase());

/**
 * `NOMBRE#f1#f2` → `{ nombre: 'NOMBRE', formatos: ['f1', 'f2'] }`. Sin barra, `formatos` vacío.
 * No valida los nombres: eso es del validador (un formato desconocido se deja pasar y se avisa).
 */
export function partirFormatos(contenido: string): { nombre: string; formatos: string[] } {
  const i = contenido.indexOf('#');
  if (i < 0) return { nombre: contenido, formatos: [] };
  return {
    nombre: contenido.slice(0, i),
    formatos: contenido.slice(i + 1).split('#').map((f) => f.trim().toLowerCase()).filter(Boolean),
  };
}

// ── Números en letra ─────────────────────────────────────────────────────────────────────────

const UNI_ES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC_ES = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN_ES = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 0–999 en castellano; `apocope`: «uno» → «un», «veintiuno» → «veintiún» (delante de un nombre o de «mil»). */
function cientosEs(n: number, apocope: boolean): string {
  const c = Math.floor(n / 100);
  const d = n % 100;
  const partes: string[] = [];
  if (c) partes.push(c === 1 && d === 0 ? 'cien' : CEN_ES[c]);
  if (d) {
    let t = d < 30 ? UNI_ES[d] : `${DEC_ES[Math.floor(d / 10)]}${d % 10 ? ` y ${UNI_ES[d % 10]}` : ''}`;
    if (apocope) t = t.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');
    partes.push(t);
  }
  return partes.join(' ');
}

const UNI_CA = ['zero', 'u', 'dos', 'tres', 'quatre', 'cinc', 'sis', 'set', 'vuit', 'nou', 'deu',
  'onze', 'dotze', 'tretze', 'catorze', 'quinze', 'setze', 'disset', 'divuit', 'dinou'];
const DEC_CA = ['', '', 'vint', 'trenta', 'quaranta', 'cinquanta', 'seixanta', 'setanta', 'vuitanta', 'noranta'];

/** 0–999 en catalán; `apocope`: «u» → «un» (delante de un nombre o de «mil»). */
function cientosCa(n: number, apocope: boolean): string {
  const c = Math.floor(n / 100);
  const d = n % 100;
  const partes: string[] = [];
  if (c) partes.push(c === 1 ? 'cent' : `${UNI_CA[c]}-cents`);
  if (d) {
    const dec = Math.floor(d / 10);
    const uni = d % 10;
    let t = d < 20 ? UNI_CA[d] : uni === 0 ? DEC_CA[dec] : `${DEC_CA[dec]}${dec === 2 ? '-i-' : '-'}${UNI_CA[uni]}`;
    if (apocope) t = t.replace(/(^|-)u$/, '$1un');
    partes.push(t);
  }
  return partes.join(' ');
}

/**
 * Un entero no negativo en letra, hasta los billones. `apocope` para cuando va delante de un nombre
 * («veintiún euros», «un euro»); delante de «mil» y de «millones» se apocopa siempre.
 */
export function enLetras(n: number, idioma = 'es', apocope = false): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`enLetras: ${n}`);
  const ca = idioma === 'ca';
  const cientos = ca ? cientosCa : cientosEs;
  if (n === 0) return ca ? 'zero' : 'cero';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) {
    if (millones === 1) partes.push(ca ? 'un milió' : 'un millón');
    else partes.push(`${enLetras(millones, idioma, true)} ${ca ? 'milions' : 'millones'}`);
  }
  if (miles) partes.push(miles === 1 ? 'mil' : `${cientos(miles, true)} mil`);
  if (resto) partes.push(cientos(resto, apocope));
  return partes.join(' ');
}

// ── Lectura del valor ────────────────────────────────────────────────────────────────────────

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CA = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

/** Una fecha en número (ISO o dd/mm/aaaa) o ya escrita con el mes en letra («14 de octubre de 2026»). */
export function leerFecha(valor: string): { dia: number; mes: number; anio: number } | null {
  const v = valor.trim();
  let dia: number, mes: number, anio: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) { anio = +m[1]; mes = +m[2]; dia = +m[3]; } else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v))) {
    dia = +m[1]; mes = +m[2]; anio = +m[3];
  } else if ((m = /^(\d{1,2})\s+(?:de\s+|d')\s*([a-zç]+)\s+de\s+(\d{4})$/i.exec(v))) {
    const nombre = m[2].toLowerCase();
    const i = MESES_ES.indexOf(nombre) >= 0 ? MESES_ES.indexOf(nombre) : MESES_CA.indexOf(nombre);
    if (i < 0) return null;
    dia = +m[1]; mes = i + 1; anio = +m[3];
  } else return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || anio < 1000) return null;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCMonth() !== mes - 1) return null;
  return { dia, mes, anio };
}

/** El número de un valor, sin el «%» ni la moneda que haya traído. */
const leerNumero = (valor: string) => parseNumero(valor.replace(/%/g, ''));

/** Separa en grupos de tres con punto: `1234567` → «1.234.567». */
const conMiles = (entero: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** El número en cifra a la española, con `decimales` fijos o, sin ellos, los que traiga (máx. 4). */
function enCifra(n: number, decimales?: number): string {
  const signo = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const txt = decimales !== undefined ? abs.toFixed(decimales) : String(Number(abs.toFixed(4)));
  const [ent, dec] = txt.split('.');
  return `${signo}${conMiles(ent)}${dec ? `,${dec}` : ''}`;
}

/** Los decimales de un número como entero de su propia longitud: 33,25 → 25; 33,5 → 5. */
function decimalesComoEntero(n: number): number | null {
  const txt = String(Number(Math.abs(n).toFixed(4)));
  const i = txt.indexOf('.');
  return i < 0 ? null : Number(txt.slice(i + 1));
}

function numeroEnLetras(n: number, idioma: string): string {
  const ent = Math.trunc(Math.abs(n));
  const dec = decimalesComoEntero(n);
  const base = enLetras(ent, idioma);
  return dec === null ? base : `${base} coma ${enLetras(dec, idioma)}`;
}

function importeEnLetras(n: number, idioma: string): string {
  const ca = idioma === 'ca';
  const euros = Math.trunc(Math.abs(Number(n.toFixed(2))));
  const centimos = Math.round((Math.abs(n) - euros) * 100);
  let t = `${enLetras(euros, idioma, true)} ${euros === 1 ? 'euro' : 'euros'}`;
  // «un millón de euros», «dos millones de euros»: delante de «millón/millones» exacto va «de».
  if (euros >= 1_000_000 && euros % 1_000_000 === 0) t = t.replace(/(millón|millones|milió|milions) euros$/, `$1 ${ca ? "d'euros" : 'de euros'}`);
  if (centimos) t += ` ${ca ? 'amb' : 'con'} ${enLetras(centimos, idioma, true)} ${ca ? (centimos === 1 ? 'cèntim' : 'cèntims') : (centimos === 1 ? 'céntimo' : 'céntimos')}`;
  return t;
}

function fechaEn(f: { dia: number; mes: number; anio: number }, modo: 'long' | 'words', idioma: string): string {
  if (idioma === 'ca') {
    const mes = MESES_CA[f.mes - 1];
    const de = /^[aeiouàèéíòóú]/i.test(mes) ? `d'${mes}` : `de ${mes}`;
    return modo === 'words' ? `${enLetras(f.dia, 'ca')} ${de} de ${enLetras(f.anio, 'ca')}` : `${f.dia} ${de} de ${f.anio}`;
  }
  const mes = MESES_ES[f.mes - 1];
  return modo === 'words' ? `${enLetras(f.dia, 'es')} de ${mes} de ${enLetras(f.anio, 'es')}` : `${f.dia} de ${mes} de ${f.anio}`;
}

const dos = (n: number) => String(n).padStart(2, '0');

export interface ResultadoFormato {
  texto: string;
  /** Si el formato no se pudo aplicar (formato desconocido o valor que no se deja leer). */
  problema?: string;
}

/** Aplica UN formato. Sin poder aplicarlo, devuelve el valor tal cual con el `problema`. */
export function aplicarFormato(valor: string, formato: string, idioma = 'es'): ResultadoFormato {
  const f = formato.trim().toLowerCase();
  const v = String(valor);
  const lang = idioma === 'ca' ? 'ca' : 'es';
  const noNumero = { texto: v, problema: `«${v}» no es un número: el formato ${f} no se aplica` };
  const noFecha = { texto: v, problema: `«${v}» no es una fecha: el formato ${f} no se aplica` };
  switch (f) {
    case 'upper': return { texto: v.toLocaleUpperCase('es') };
    case 'lower': return { texto: v.toLocaleLowerCase('es') };
    case 'capitalize': return { texto: v.charAt(0).toLocaleUpperCase('es') + v.slice(1) };
    case 'thousands': { const n = leerNumero(v); return n === null ? noNumero : { texto: enCifra(n) }; }
    case 'amount': { const n = leerNumero(v); return n === null ? noNumero : { texto: enCifra(n, 2) }; }
    case 'amount_words': { const n = leerNumero(v); return n === null || n < 0 ? noNumero : { texto: importeEnLetras(n, lang) }; }
    case 'words': { const n = leerNumero(v); return n === null || n < 0 ? noNumero : { texto: numeroEnLetras(n, lang) }; }
    case 'percent': { const n = leerNumero(v); return n === null ? noNumero : { texto: `${enCifra(n)} %` }; }
    case 'percent_words': {
      const n = leerNumero(v);
      return n === null || n < 0 ? noNumero : { texto: `${numeroEnLetras(n, lang)} ${lang === 'ca' ? 'per cent' : 'por ciento'}` };
    }
    case 'date': { const x = leerFecha(v); return x ? { texto: `${dos(x.dia)}/${dos(x.mes)}/${x.anio}` } : noFecha; }
    case 'date_long': { const x = leerFecha(v); return x ? { texto: fechaEn(x, 'long', lang) } : noFecha; }
    case 'date_words': { const x = leerFecha(v); return x ? { texto: fechaEn(x, 'words', lang) } : noFecha; }
    default: return { texto: v, problema: `formato desconocido «${formato}»` };
  }
}

/** Aplica una cadena de formatos, de izquierda a derecha. Junta los problemas. */
export function aplicarFormatos(valor: string, formatos: string[], idioma = 'es'): ResultadoFormato {
  let texto = String(valor);
  const problemas: string[] = [];
  for (const f of formatos) {
    const r = aplicarFormato(texto, f, idioma);
    texto = r.texto;
    if (r.problema) problemas.push(r.problema);
  }
  return problemas.length ? { texto, problema: problemas.join('; ') } : { texto };
}
