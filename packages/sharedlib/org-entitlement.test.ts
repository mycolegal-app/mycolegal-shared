// npx tsx org-entitlement.test.ts
import assert from 'node:assert/strict';

process.env.AUTH_SERVICE_URL = 'http://auth.test';
process.env.APPS_REGISTER_SECRET = 'clave';
const { orgHasApp, isRealOrgId, _limpiarCacheOrgHasApp } = await import('./org-entitlement');

const ORG = '346a5e69-3e42-42d9-954d-3475c36ca14a';
let llamadas = 0;
let respuesta: () => Promise<Response> = async () => new Response(JSON.stringify({ data: { active: true } }));
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  llamadas++;
  assert.equal(url, `http://auth.test/internal/orgs/${ORG}/apps/facturae`);
  assert.equal((init?.headers as Record<string, string>)['X-Service-Key'], 'clave');
  return respuesta();
}) as typeof fetch;

assert.equal(isRealOrgId(ORG), true);
assert.equal(isRealOrgId('_system'), false);

// Activa, y la segunda vez sale de la caché.
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'denegar' }), true);
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'denegar' }), true);
assert.equal(llamadas, 1);

// Inactiva.
_limpiarCacheOrgHasApp();
respuesta = async () => new Response(JSON.stringify({ data: { active: false } }));
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'conceder' }), false);

// Auth caído: decide `siFalla`, y no se cachea.
_limpiarCacheOrgHasApp();
respuesta = async () => { throw new Error('ECONNREFUSED'); };
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'denegar' }), false);
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'conceder' }), true);
respuesta = async () => new Response('x', { status: 500 });
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'conceder' }), true);

// Respuesta sin booleano: cuenta como fallo y no se cachea.
_limpiarCacheOrgHasApp();
respuesta = async () => new Response(JSON.stringify({ data: {} }));
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'conceder' }), true);
assert.equal(await orgHasApp(ORG, 'facturae', { siFalla: 'denegar' }), false);

// Sin org real no se pregunta.
const antes = llamadas;
assert.equal(await orgHasApp('_system', 'facturae', { siFalla: 'denegar' }), false);
assert.equal(await orgHasApp('_system', 'facturae', { siFalla: 'denegar', sinOrgReal: true }), true);
assert.equal(llamadas, antes);
console.log('org-entitlement: OK');
