// Documentos de Office sin nombre ni MIME que lo digan: `npx tsx packages/text-extract/contenedor.test.ts`.
//
// PROD, Revisor de Consultor (12-nov-2026): un Word llamado «CV RESTING RIOJA, S.L» (sin .docx) llegó como
// octet-stream, se tomó por PDF y se mandó al OCR como `application/pdf`; Vertex lo rechazó (400 → 502 de
// platform) y el usuario vio «no se pudo extraer texto». Ahora se reconoce por dentro y nunca va al OCR.
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extraerTexto } from './index';

const unir = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const le16 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255]);
const le32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const txt = (s: string) => new TextEncoder().encode(s);
function zip(ficheros: [string, Uint8Array][]): Uint8Array {
  const locales: Uint8Array[] = [], centrales: Uint8Array[] = [];
  let offset = 0;
  for (const [nombre, datos] of ficheros) {
    const n = txt(nombre), c = new Uint8Array(deflateRawSync(datos));
    const local = unir(le32(0x04034b50), le16(20), le16(0), le16(8), le32(0), le32(0), le32(c.length), le32(datos.length), le16(n.length), le16(0), n, c);
    centrales.push(unir(le32(0x02014b50), le16(20), le16(20), le16(0), le16(8), le32(0), le32(0), le32(c.length), le32(datos.length),
      le16(n.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), n));
    locales.push(local); offset += local.length;
  }
  const central = unir(...centrales);
  return unir(...locales, central, le32(0x06054b50), le16(0), le16(0), le16(ficheros.length), le16(ficheros.length), le32(central.length), le32(offset), le16(0));
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docx = zip([
  ['[Content_Types].xml', txt('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')],
  ['_rels/.rels', txt('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')],
  ['word/document.xml', txt(`<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>Compraventa otorgada por RESTING RIOJA, S.L.</w:t></w:r></w:p></w:body></w:document>`)],
]);

// Cualquier llamada al OCR se cuenta: ninguno de estos casos debe llegar a él.
let llamadasOcr = 0;
globalThis.fetch = (async () => { llamadasOcr++; return new Response('{}', { status: 502 }); }) as typeof fetch;
const ocr = { platformUrl: 'http://platform.invalid', serviceKey: 'k' };

async function main() {
  const r = await extraerTexto(docx, { mime: 'application/octet-stream', fileName: 'CV RESTING RIOJA, S.L', ocr });
  assert.equal(r.metodo, 'word');
  assert.match(r.texto, /RESTING RIOJA/);
  console.log('  ✓ un .docx sin extensión y octet-stream se lee como Word');

  const r2 = await extraerTexto(docx, { mime: 'application/pdf', fileName: 'escritura.pdf', ocr });
  assert.equal(r2.metodo, 'word');
  console.log('  ✓ un .docx con nombre y MIME de PDF también: mandan los bytes');

  const pptx = zip([['ppt/presentation.xml', txt('<p:presentation/>')]]);
  const r3 = await extraerTexto(pptx, { mime: 'application/octet-stream', fileName: 'presentacion', ocr });
  assert.equal(r3.metodo, 'empty');
  console.log('  ✓ otro ZIP (un .pptx) sale vacío, sin pasar por el OCR');

  const ole = unir(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), new Uint8Array(2_000));
  const r4 = await extraerTexto(ole, { mime: 'application/pdf', fileName: 'antiguo', ocr });
  assert.equal(r4.metodo, 'empty');
  console.log('  ✓ un OLE ilegible (.doc/.xls antiguo) sale vacío, sin pasar por el OCR');

  assert.equal(llamadasOcr, 0, 'ningún contenedor de Office va al OCR');
  console.log('  ✓ cero llamadas al OCR');
}
main().catch((e) => { console.error(e); process.exit(1); });
