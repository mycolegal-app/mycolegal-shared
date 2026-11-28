// #29 (test, Anna) — Validación del HTML que manda «Descargar PDF» del manual
// antes de pintarlo en platform (`lib/manual-pdf`). Puros:
//
// (portados de mycolegal-peticiones el 28-nov-2026)
import { it } from 'vitest';
import assert from 'node:assert/strict';
import {
  MANUAL_PDF_MAX_BYTES,
  contentDisposition,
  esReferenciaExterna,
  leerCuerpoConTope,
  nombreFicheroPdf,
  primeraReferenciaExterna,
  manualPdfPost,
} from './manual-pdf';

const caso = (nombre: string, fn: () => void | Promise<void>) => it(nombre, fn);

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const doc = (cuerpo: string, css = '') =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual</title><style>${css}</style></head><body>${cuerpo}</body></html>`;

caso('el manual autocontenido (data:, enlaces <a>, anclas) pasa', () => {
  const html = doc(
    `<div data-manual-print><img src="${PNG}" alt="x"><a href="https://mycolegal.app/ayuda">web</a>` +
      `<a href="#sec-1">Índice</a><p style="background:url('${PNG}')">Texto con url(https://ejemplo.com) en prosa? no</p></div>`,
    `@font-face{font-family:X;src:url("data:font/woff2;base64,AAAA") format("woff2")} .a>.b{color:red}`,
  );
  // La prosa de arriba trae «url(https://…)» como texto: el filtro es deliberadamente
  // estricto con `url(`, así que se comprueba aparte el caso sin esa frase.
  assert.notEqual(primeraReferenciaExterna(html), null);
  const limpio = html.replace('Texto con url(https://ejemplo.com) en prosa? no', 'Texto');
  assert.equal(primeraReferenciaExterna(limpio), null);
});

caso('src / srcset / poster / data externos se rechazan', () => {
  for (const tag of [
    '<img src="https://169.254.169.254/computeMetadata/v1/">',
    '<img src=http://interno.local/x.png>',
    `<img src="${PNG}" srcset="${PNG} 1x, https://x.test/a.png 2x">`,
    '<video poster="http://x.test/p.png"></video>',
    '<object data="file:///etc/passwd"></object>',
    '<iframe src="//evil.test/"></iframe>',
    '<img SRC="HTTPS://X.TEST/A.PNG">',
    '<svg><image xlink:href="http://x.test/a.svg"/></svg>',
    '<svg><image href="http://x.test/a.svg"/></svg>',
  ]) {
    assert.notEqual(primeraReferenciaExterna(doc(tag)), null, tag);
  }
});

caso('href de <link> (stylesheet, preload, icon) externo se rechaza; el de <a> no', () => {
  assert.notEqual(primeraReferenciaExterna(doc('<link rel="stylesheet" href="https://cdn.test/x.css">')), null);
  assert.notEqual(primeraReferenciaExterna(doc('<link rel="preload" as="font" href="http://x.test/f.woff2">')), null);
  assert.notEqual(primeraReferenciaExterna(doc('<link rel="icon" href="file:///tmp/x.ico">')), null);
  assert.equal(primeraReferenciaExterna(doc('<a href="https://x.test/">x</a>')), null);
});

caso('url(...) y @import externos en CSS se rechazan (comillas o sin ellas)', () => {
  for (const css of [
    '.a{background:url(https://x.test/a.png)}',
    ".a{background:url('http://x.test/a.png')}",
    '.a{background:url( "file:///etc/hosts" )}',
    '@import "https://x.test/a.css";',
    "@import url(https://x.test/a.css);",
    '.a{background-image:image-set("https://x.test/a.png" 1x)}',
  ]) {
    assert.notEqual(primeraReferenciaExterna(doc('<p>x</p>', css)), null, css);
  }
  assert.notEqual(primeraReferenciaExterna(doc('<p style="background:url(http://x.test/a)">x</p>')), null);
});

caso('las codificaciones que esquivan un filtro ingenuo no lo esquivan', () => {
  assert.equal(esReferenciaExterna('&#104;ttp://x.test/'), true);
  assert.equal(esReferenciaExterna('&#x68;ttps://x.test/'), true);
  assert.equal(esReferenciaExterna('http&colon;//x.test/'), true);
  assert.equal(esReferenciaExterna(' \n\thttps://x.test/'), true);
  assert.equal(esReferenciaExterna('ht\ttp://x.test/'), true);
  assert.equal(esReferenciaExterna('\\\\servidor\\recurso'), true);
  assert.equal(esReferenciaExterna(PNG), false);
  assert.equal(esReferenciaExterna('#ancla'), false);
  assert.equal(esReferenciaExterna('/manual/capturas/a.jpg'), false); // relativo a about:blank: no carga nada
});

caso('<meta http-equiv="refresh"> se rechaza', () => {
  assert.notEqual(primeraReferenciaExterna(doc('<meta http-equiv="refresh" content="0;url=http://x.test">')), null);
});

caso('nombre de fichero saneado para Content-Disposition', () => {
  assert.deepEqual(nombreFicheroPdf('MycoLegal Portal - Gestoría.pdf'), {
    ascii: 'MycoLegal Portal - Gestoria.pdf',
    utf8: 'MycoLegal Portal - Gestoría.pdf',
  });
  assert.equal(nombreFicheroPdf('../../etc/passwd').utf8, 'etc passwd.pdf');
  assert.equal(nombreFicheroPdf('a"\r\nSet-Cookie: x=1').ascii, 'a Set-Cookie x=1.pdf');
  assert.equal(nombreFicheroPdf('').utf8, 'Manual.pdf');
  assert.equal(nombreFicheroPdf(42).utf8, 'Manual.pdf');
  assert.equal(nombreFicheroPdf('...').utf8, 'Manual.pdf');
  assert.ok(nombreFicheroPdf('x'.repeat(500)).utf8.length <= 124);
  const cd = contentDisposition('Manual del Portal — Banco');
  assert.match(cd, /^attachment; filename="Manual del Portal _ Banco\.pdf"; filename\*=UTF-8''/);
  assert.doesNotMatch(cd, /[\r\n]/);
});

caso('el cuerpo se corta al pasar el tope (declarado o real)', async () => {
  const grande = new Request('http://x/', { method: 'POST', body: 'a'.repeat(1000), headers: { 'content-length': '1000' } });
  assert.equal(await leerCuerpoConTope(grande, 999), null);
  const sinCabecera = new Request('http://x/', {
    method: 'POST',
    body: new ReadableStream({
      start(c) {
        for (let i = 0; i < 10; i++) c.enqueue(new TextEncoder().encode('b'.repeat(100)));
        c.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);
  assert.equal(await leerCuerpoConTope(sinCabecera, 500), null);
  const ok = new Request('http://x/', { method: 'POST', body: '{"html":"ñ"}' });
  assert.equal(await leerCuerpoConTope(ok, 100), '{"html":"ñ"}');
  assert.ok(MANUAL_PDF_MAX_BYTES < 12 * 1024 * 1024, 'por debajo del bodyLimit de platform');
});


caso('manualPdfPost: sin sesión 401; HTML con red 422; bueno → PDF de platform con blockNetwork', async () => {
  const llamadas: { url: string; body: string; key: string | null }[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, body: String(init.body), key: new Headers(init.headers).get('X-Service-Key') });
    return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
  }) as typeof fetch;
  try {
    const sinSesion = manualPdfPost({ platformUrl: 'http://p/', serviceKey: 'k', verificarSesion: async () => { throw new Error('x'); } });
    const conSesion = manualPdfPost({ platformUrl: 'http://p/', serviceKey: 'k', verificarSesion: async () => {} });
    const pedir = (html: string) => new Request('http://x/', { method: 'POST', body: JSON.stringify({ html, fileName: 'Manual LegiFirma' }) });
    assert.equal((await sinSesion(pedir(doc('a')))).status, 401);
    assert.equal((await conSesion(pedir(doc('<img src="https://evil/x.png">')))).status, 422);
    const r = await conSesion(pedir(doc('<p>ok</p>')));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Content-Type'), 'application/pdf');
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, 'http://p/internal/pdf');
    assert.equal(llamadas[0].key, 'k');
    assert.ok(llamadas[0].body.includes('"blockNetwork":true'));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
