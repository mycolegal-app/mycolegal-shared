// Las IMÁGENES de dentro de un Word sin texto (10-nov-2026, PROD de la notaría Micó): notas simples y
// certificaciones del Catastro escaneadas y pegadas en un .doc. `word-extractor` sólo lee el texto escrito,
// así que salían «no se pudo leer texto (método: empty)» y la IA no veía nada. Se recuperan los JPEG y PNG
// tal cual van guardados dentro del fichero (Word 97 los guarda sin comprimir) para pasarlos por el OCR.
//
// Se recorren con su propia estructura —los segmentos del JPEG, los bloques del PNG—, no buscando un final
// cualquiera, para no cortar una imagen por unos bytes que lo parezcan. Un .docx es un ZIP con las imágenes
// COMPRIMIDAS en `word/media/`: ahí no se buscan en los bytes, se sacan del ZIP (0.2.3).
import { inflateRawSync } from 'node:zlib';

export interface ImagenIncrustada { mime: 'image/jpeg' | 'image/png'; bytes: Uint8Array }

/** Lo que no es un escaneo: iconos, viñetas, logos pequeños. */
const MINIMO_BYTES = 8_000;

/** Fin de un JPEG que empieza en `i` (SOI), o -1 si no es un JPEG entero. */
function finJpeg(b: Uint8Array, i: number): number {
  let p = i + 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return -1;
    const m = b[p + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
    if (m === 0xd9) return p + 2;
    const largo = (b[p + 2] << 8) | b[p + 3];
    if (largo < 2) return -1;
    p += 2 + largo;
    if (m === 0xda) {
      // Datos comprimidos hasta el siguiente marcador que no sea relleno (FF00) ni de reinicio (FFD0-FFD7).
      while (p + 1 < b.length) {
        if (b[p] === 0xff && b[p + 1] !== 0x00 && !(b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7)) break;
        p++;
      }
    }
  }
  return -1;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Fin de un PNG que empieza en `i`, o -1 si no es un PNG entero. */
function finPng(b: Uint8Array, i: number): number {
  let p = i + 8;
  while (p + 12 <= b.length) {
    const largo = ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
    const tipo = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (!/^[A-Za-z]{4}$/.test(tipo)) return -1;
    p += 12 + largo;
    if (tipo === 'IEND') return p <= b.length ? p : -1;
  }
  return -1;
}

const u16 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8);
const u32 = (b: Uint8Array, p: number) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;

/** Las imágenes de `word/media/` de un .docx (ZIP), descomprimidas. `null` si no es un ZIP legible. */
function imagenesDeDocx(b: Uint8Array, maximo: number): ImagenIncrustada[] | null {
  if (u32(b, 0) !== 0x04034b50) return null;
  // El final del directorio central, buscando hacia atrás (puede llevar un comentario de hasta 64 KB).
  let fin = -1;
  for (let p = b.length - 22; p >= Math.max(0, b.length - 22 - 65_535); p--) if (u32(b, p) === 0x06054b50) { fin = p; break; }
  if (fin < 0) return null;
  const entradas = u16(b, fin + 10);
  let p = u32(b, fin + 16);
  const out: ImagenIncrustada[] = [];
  for (let k = 0; k < entradas && p + 46 <= b.length && out.length < maximo; k++) {
    if (u32(b, p) !== 0x02014b50) return out;
    const metodo = u16(b, p + 10), comprimido = u32(b, p + 20);
    const largoNombre = u16(b, p + 28), largoExtra = u16(b, p + 30), largoComentario = u16(b, p + 32);
    const local = u32(b, p + 42);
    const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    const tipo = /^word\/media\/.+\.(jpe?g|png)$/i.exec(nombre)?.[1]?.toLowerCase();
    if (!tipo || u32(b, local) !== 0x04034b50) continue;
    const desde = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const datos = b.subarray(desde, desde + comprimido);
    let bytes: Uint8Array;
    try { bytes = metodo === 0 ? datos : metodo === 8 ? new Uint8Array(inflateRawSync(datos)) : new Uint8Array(); } catch { continue; }
    if (bytes.length >= MINIMO_BYTES) out.push({ mime: tipo === 'png' ? 'image/png' : 'image/jpeg', bytes });
  }
  return out;
}

/** Las imágenes JPEG y PNG enteras que lleva dentro un fichero, en orden y sin repetir. */
export function imagenesIncrustadas(bytes: Uint8Array, maximo = 12): ImagenIncrustada[] {
  const docx = imagenesDeDocx(bytes, maximo);
  if (docx) return docx;
  const out: ImagenIncrustada[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i + 8 < bytes.length && out.length < maximo; i++) {
    let fin = -1;
    let mime: ImagenIncrustada['mime'] | null = null;
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) { fin = finJpeg(bytes, i); mime = 'image/jpeg'; }
    else if (FIRMA_PNG.every((v, k) => bytes[i + k] === v)) { fin = finPng(bytes, i); mime = 'image/png'; }
    if (!mime || fin < 0) continue;
    const trozo = bytes.subarray(i, fin);
    const firma = `${trozo.length}:${trozo[trozo.length >> 1]}:${trozo[trozo.length >> 2]}`;
    if (trozo.length >= MINIMO_BYTES && !vistas.has(firma)) {
      vistas.add(firma);
      out.push({ mime, bytes: trozo });
    }
    i = fin - 1;
  }
  return out;
}
