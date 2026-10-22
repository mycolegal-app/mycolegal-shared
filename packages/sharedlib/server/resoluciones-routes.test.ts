// Proxy de MycoBot hacia Consultor: cabeceras que vuelven al navegador.
//   npx tsx server/resoluciones-routes.test.ts   (desde packages/sharedlib)
//
// Exportar una skill (.myc) desde una app que no es Consultor no descargaba: el proxy
// solo reenviaba Content-Type y se perdía el `Content-Disposition: attachment`.
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { cabecerasDeRespuesta, forwardResoluciones } from './resoluciones-routes';

async function run(nombre: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`  ✓ ${nombre}`);
}

await run('reenvía Content-Disposition y Content-Type', () => {
  const h = cabecerasDeRespuesta(
    new Headers({
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="Cuadre-de-herencias.myc"',
      'x-otra': 'no',
    }),
  );
  assert.deepEqual(h, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="Cuadre-de-herencias.myc"',
  });
});

await run('sin Content-Disposition no se inventa; Content-Type por defecto JSON', () => {
  assert.deepEqual(cabecerasDeRespuesta(new Headers()), { 'Content-Type': 'application/json' });
});

await run('extremo a extremo: el export de una skill sale como descarga', async () => {
  const fetchOriginal = globalThis.fetch;
  let urlPedida = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    urlPedida = String(url);
    return new Response('{"myc":1}', {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="skill.myc"',
      },
    });
  }) as typeof fetch;
  try {
    const res = await forwardResoluciones({
      consultorUrl: 'http://consultor:3000/',
      serviceKey: 'k',
      orgId: 'o',
      userId: 'u',
      path: ['skills', 'abc', 'export'],
      request: new NextRequest('http://app.local/api/resoluciones/skills/abc/export'),
    });
    assert.equal(urlPedida, 'http://consultor:3000/api/inter/resoluciones/skills/abc/export');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="skill.myc"');
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(await res.text(), '{"myc":1}');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

console.log('resoluciones-routes: OK');
