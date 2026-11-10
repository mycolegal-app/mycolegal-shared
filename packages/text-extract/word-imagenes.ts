// Las IMÁGENES de dentro de un Word sin texto (10-nov-2026, PROD de la notaría Micó): notas simples y
// certificaciones del Catastro escaneadas y pegadas en un .doc. `word-extractor` sólo lee el texto escrito,
// así que salían «no se pudo leer texto (método: empty)» y la IA no veía nada. Se recuperan los JPEG y PNG
// tal cual van guardados dentro del fichero (Word 97 los guarda sin comprimir) para pasarlos por el OCR.
//
// Se recorren con su propia estructura —los segmentos del JPEG, los bloques del PNG—, no buscando un final
// cualquiera, para no cortar una imagen por unos bytes que lo parezcan. Puro, sin dependencias.

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

/** Las imágenes JPEG y PNG enteras que lleva dentro un fichero, en orden y sin repetir. */
export function imagenesIncrustadas(bytes: Uint8Array, maximo = 12): ImagenIncrustada[] {
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
