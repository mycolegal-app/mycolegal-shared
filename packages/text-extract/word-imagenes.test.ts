// Prueba de las imágenes de dentro de un Word: `npx tsx packages/text-extract/word-imagenes.test.ts`.
//
// PROD, notaría Micó (nov-2026): .doc con notas simples escaneadas salían vacíos. Se reproduce con un JPEG y un
// PNG construidos aquí, metidos entre bytes que no son imagen, como van dentro de un .doc de Word 97.
import assert from 'node:assert/strict';
import { imagenesIncrustadas } from './word-imagenes';

const relleno = (n: number, v = 0x41) => new Uint8Array(n).fill(v);
const unir = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const bloquePng = (tipo: string, datos: Uint8Array) => unir(be32(datos.length), new TextEncoder().encode(tipo), datos, be32(0));

const png = unir(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloquePng('IHDR', relleno(13, 1)), bloquePng('IDAT', relleno(12_000, 7)), bloquePng('IEND', new Uint8Array()));
// JPEG: SOI, un APP0 de 16 bytes, el SOS y datos con un FF00 (relleno) y un FFD3 (reinicio) dentro, y EOI.
const jpeg = unir(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), relleno(14, 0x4a),
  new Uint8Array([0xff, 0xda, 0x00, 0x08]), relleno(6, 1), relleno(5_000, 0x55), new Uint8Array([0xff, 0x00]),
  relleno(5_000, 0x66), new Uint8Array([0xff, 0xd3]), relleno(2_000, 0x77), new Uint8Array([0xff, 0xd9]));

const doc = unir(relleno(3_000, 0xd0), png, relleno(700, 0x00), jpeg, relleno(1_000, 0xff), png);
const im = imagenesIncrustadas(doc);

assert.equal(im.length, 2, 'un PNG y un JPEG; el PNG repetido no cuenta dos veces');
assert.equal(im[0].mime, 'image/png');
assert.deepEqual(im[0].bytes, png);
assert.equal(im[1].mime, 'image/jpeg');
assert.deepEqual(im[1].bytes, jpeg, 'el relleno FF00 y el reinicio FFD3 no cortan el JPEG');
console.log('  ✓ las imágenes de dentro de un Word salen enteras, en orden y sin repetir');

const icono = unir(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloquePng('IHDR', relleno(13, 1)), bloquePng('IEND', new Uint8Array()));
assert.equal(imagenesIncrustadas(unir(relleno(100), icono)).length, 0);
console.log('  ✓ un icono pequeño no se manda al OCR');

const cortado = jpeg.subarray(0, jpeg.length - 2);
assert.equal(imagenesIncrustadas(unir(relleno(100), cortado)).length, 0);
console.log('  ✓ un JPEG a medias no se manda');

// Un .docx es un ZIP con las imágenes comprimidas en word/media/: se sacan del ZIP, no de los bytes.
import { deflateRawSync } from 'node:zlib';
const le16 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255]);
const le32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
function zip(ficheros: [string, Uint8Array][]): Uint8Array {
  const locales: Uint8Array[] = [], centrales: Uint8Array[] = [];
  let offset = 0;
  for (const [nombre, datos] of ficheros) {
    const n = new TextEncoder().encode(nombre), c = new Uint8Array(deflateRawSync(datos));
    const local = unir(le32(0x04034b50), le16(20), le16(0), le16(8), le32(0), le32(0), le32(c.length), le32(datos.length), le16(n.length), le16(0), n, c);
    centrales.push(unir(le32(0x02014b50), le16(20), le16(20), le16(0), le16(8), le32(0), le32(0), le32(c.length), le32(datos.length),
      le16(n.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), n));
    locales.push(local); offset += local.length;
  }
  const central = unir(...centrales);
  return unir(...locales, central, le32(0x06054b50), le16(0), le16(0), le16(ficheros.length), le16(ficheros.length), le32(central.length), le32(offset), le16(0));
}
const docx = zip([['word/document.xml', new TextEncoder().encode('<w:document/>')], ['word/media/image1.png', png], ['word/media/image2.jpeg', jpeg]]);
const enDocx = imagenesIncrustadas(docx);
assert.equal(enDocx.length, 2);
assert.deepEqual(enDocx[0].bytes, png);
assert.deepEqual(enDocx[1].bytes, jpeg);
console.log('  ✓ un .docx: las imágenes comprimidas de word/media salen enteras');
