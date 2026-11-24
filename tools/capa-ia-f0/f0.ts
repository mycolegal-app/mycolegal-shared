// F0 · PLAN_TECNICO_CAPA_IA §3.9 — cinco preguntas al AI SDK contra Vertex real (datos sintéticos).
import { createVertex } from '@ai-sdk/google-vertex';
import { generateText, streamText, tool, jsonSchema, stepCountIs, Output } from 'ai';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const PROJECT = 'mycolegal-app';
const LOCATION = 'eu';
const OUT = new URL('./capturas/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

type Captura = { url: string; body: any; status?: number; resp?: any };
const capturas: Captura[] = [];
let n = 0;
const fetchEspia: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input as any).url ?? String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const r = await fetch(input as any, init);
  const c: Captura = { url, body, status: r.status };
  capturas.push(c);
  const clon = r.clone();
  if (!url.includes('alt=sse')) c.resp = await clon.json().catch(() => undefined);
  writeFileSync(`${OUT}${String(++n).padStart(2, '0')}.json`, JSON.stringify(c, null, 2));
  return r;
};

const vertex = createVertex({ project: PROJECT, location: LOCATION, fetch: fetchEspia });
const res: Record<string, string> = {};
const ok = (q: string, b: boolean, d: string) => { res[q] = `${b ? 'SÍ' : 'NO'} — ${d}`; console.log(`\n[${q}] ${res[q]}`); };

async function p1() {
  const desde = capturas.length;
  const r = await generateText({ model: vertex('gemini-3.5-flash-lite'), prompt: 'Responde solo: hola' });
  const u = capturas[desde].url;
  ok('P1 host EU', u.startsWith('https://aiplatform.eu.rep.googleapis.com/v1/projects/mycolegal-app/locations/eu/'), `${u} → «${r.text.trim()}»`);
}

async function p2() {
  // Bucle de 3 vueltas forzado: cada herramienta da el dato que pide la siguiente.
  const fincas = { 'F-001': { refcat: 'RC-SINT-123' } } as const;
  const tools = {
    buscar_finca: tool({
      description: 'Busca una finca por su número registral y devuelve su identificador interno',
      inputSchema: jsonSchema<{ numero: string }>({ type: 'object', properties: { numero: { type: 'string' } }, required: ['numero'] }),
      execute: async () => ({ id: 'F-001' }),
    }),
    referencia_catastral: tool({
      description: 'Devuelve la referencia catastral de una finca por su identificador interno (F-xxx)',
      inputSchema: jsonSchema<{ id: string }>({ type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }),
      execute: async ({ id }) => fincas[id as 'F-001'] ?? { error: 'no existe' },
    }),
    superficie_catastral: tool({
      description: 'Devuelve la superficie en m² dada una referencia catastral',
      inputSchema: jsonSchema<{ refcat: string }>({ type: 'object', properties: { refcat: { type: 'string' } }, required: ['refcat'] }),
      execute: async ({ refcat }) => (refcat === 'RC-SINT-123' ? { m2: 87.5 } : { error: 'no existe' }),
    }),
  };
  const desde = capturas.length;
  const r = await generateText({
    model: vertex('gemini-3.8-flash'),
    tools,
    stopWhen: stepCountIs(6),
    system: 'Usa las herramientas una a una; no adivines datos.',
    prompt: '¿Qué superficie catastral tiene la finca registral número 4521? Necesitas encadenar las tres herramientas.',
  });
  const bodies = capturas.slice(desde).map((c) => c.body);
  const vueltas = bodies.length;
  // En cada petición posterior a la 1.ª, ¿las partes functionCall del modelo llevan thoughtSignature?
  let llamadas = 0, conFirma = 0;
  for (const b of bodies.slice(1)) for (const c of b.contents) if (c.role === 'model') for (const p of c.parts) if (p.functionCall) { llamadas++; if (p.thoughtSignature) conFirma++; }
  const statuses = capturas.slice(desde).map((c) => c.status).join(',');
  // ¿La firma sale en response.messages para poder persistirla (Mensaje.opaco)?
  const msgs = JSON.stringify(r.response.messages);
  const enMensajes = msgs.includes('thoughtSignature');
  ok('P2 thoughtSignature', vueltas >= 4 && llamadas > 0 && llamadas === conFirma && !statuses.includes('400'),
    `${vueltas} peticiones (status ${statuses}); functionCall reenviadas ${llamadas}, con firma ${conFirma}; firma en response.messages: ${enMensajes}; respuesta «${r.text.trim().slice(0, 120)}»`);
  writeFileSync(`${OUT}p2-response-messages.json`, JSON.stringify(r.response.messages, null, 2));
}

async function p3() {
  const token = execSync('gcloud auth application-default print-access-token').toString().trim();
  const base = `https://aiplatform.eu.rep.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}`;
  // Texto sintético largo (>4k tokens) para superar el mínimo de caché.
  const texto = Array.from({ length: 400 }, (_, i) => `Cláusula ${i + 1}. El comprador sintético número ${i} adquiere la finca ficticia ${i * 7} por un precio de ${1000 + i} euros, libre de cargas.`).join('\n');
  const cr = await fetch(`${base}/cachedContents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/gemini-3.8-flash`, contents: [{ role: 'user', parts: [{ text: texto }] }], ttl: '300s' }),
  });
  const cache = await cr.json();
  if (!cache.name) { ok('P3 cachedContents', false, `crear caché falló: ${cr.status} ${JSON.stringify(cache).slice(0, 300)}`); return; }
  try {
    const desde = capturas.length;
    const r = await generateText({
      model: vertex('gemini-3.8-flash'),
      prompt: '¿Qué precio tiene la cláusula 37? Solo el número.',
      providerOptions: { vertex: { cachedContent: cache.name } },
    });
    const body = capturas[desde].body;
    const cached = (r.providerMetadata as any)?.vertex?.usageMetadata?.cachedContentTokenCount ?? (capturas[desde].resp?.usageMetadata?.cachedContentTokenCount);
    ok('P3 cachedContents', body.cachedContent === cache.name && Number(cached) > 0,
      `body.cachedContent=${body.cachedContent === cache.name}; cachedContentTokenCount=${cached}; «${r.text.trim()}»`);
  } finally {
    await fetch(`https://aiplatform.eu.rep.googleapis.com/v1/${cache.name}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
}

async function p4() {
  // Comparar el cuerpo del AI SDK con el que montaría hoy Redactor para la misma petición con esquema.
  const desde = capturas.length;
  await generateText({
    model: vertex('gemini-3.5-flash-lite'),
    system: 'Extrae datos.',
    prompt: 'Juan Pérez, DNI 00000000T, compra.',
    temperature: 0,
    maxOutputTokens: 200,
    output: Output.object({ schema: jsonSchema({ type: 'object', properties: { nombre: { type: 'string' }, dni: { type: 'string' } }, required: ['nombre', 'dni'] }) }),
  });
  const body = capturas[desde].body;
  const nuestro = {
    systemInstruction: { parts: [{ text: 'Extrae datos.' }] },
    contents: [{ role: 'user', parts: [{ text: 'Juan Pérez, DNI 00000000T, compra.' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, dni: { type: 'STRING' } }, required: ['nombre', 'dni'] } },
  };
  writeFileSync(`${OUT}p4-comparacion.json`, JSON.stringify({ aisdk: body, nuestro }, null, 2));
  const igual = JSON.stringify(body) === JSON.stringify(nuestro);
  ok('P4 cuerpo exacto', true, `capturable con fetch propio (sí). ¿Idéntico al nuestro? ${igual}. Claves AI SDK: ${Object.keys(body).join(',')}; generationConfig: ${JSON.stringify(body.generationConfig)}`);
}

async function p5() {
  const desde = capturas.length;
  await generateText({ model: vertex('gemini-3.8-flash'), prompt: 'Di "a".', providerOptions: { vertex: { thinkingConfig: { thinkingBudget: 0 } } } });
  await generateText({ model: vertex('gemini-4-argon'), prompt: 'Di "b".', providerOptions: { vertex: { thinkingConfig: { thinkingLevel: 'low' } } } });
  await generateText({ model: vertex('gemini-3.8-flash'), prompt: 'Di "c".' }); // sin opciones: ¿añade algo por su cuenta?
  const [a, b, c] = capturas.slice(desde);
  const ta = a.body.generationConfig?.thinkingConfig, tb = b.body.generationConfig?.thinkingConfig, tc = c.body.generationConfig;
  ok('P5 thinking', ta?.thinkingBudget === 0 && tb?.thinkingLevel === 'low' && a.status === 200 && b.status === 200,
    `3.8-flash: ${JSON.stringify(ta)} (${a.status}); argon: ${JSON.stringify(tb)} (${b.status}); sin opciones generationConfig=${JSON.stringify(tc)}`);
}

async function extraStream() {
  const desde = capturas.length;
  const s = streamText({ model: vertex('gemini-3.5-flash-lite'), prompt: 'Cuenta del 1 al 5.' });
  let t = ''; for await (const d of s.textStream) t += d;
  res['Extra streaming'] = `${capturas[desde].url.includes('streamGenerateContent?alt=sse')} — «${t.trim().replace(/\n/g, ' ')}»`;
  console.log('\n[Extra streaming]', res['Extra streaming']);
}

for (const [nombre, f] of Object.entries({ p1, p2, p3, p4, p5, extraStream })) {
  try { await f(); } catch (e: any) { res[nombre] = `ERROR ${e?.message?.slice(0, 400)}`; console.log(`\n[${nombre}] ERROR`, e?.message?.slice(0, 600), e?.responseBody?.slice?.(0, 600) ?? ''); }
}
writeFileSync(`${OUT}resumen.json`, JSON.stringify(res, null, 2));
