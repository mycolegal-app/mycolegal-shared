import { createVertex } from '@ai-sdk/google-vertex';
import { generateText, Output, jsonSchema } from 'ai';
let body: any;
const v = createVertex({ project: 'mycolegal-app', location: 'eu',
  baseURL: 'https://aiplatform.eu.rep.googleapis.com/v1/projects/mycolegal-app/locations/eu/publishers/google',
  fetch: async (i, init) => { body = JSON.parse(String(init!.body)); return fetch(i as any, init); } });
const schema = { type: 'object', properties: {
  regimen: { type: 'string', enum: ['gananciales', 'separacion', 'participacion'] },
  conyuge: { type: ['string', 'null'] },
  fincas: { type: 'array', items: { type: 'object', properties: { numero: { type: 'string' }, m2: { type: ['number', 'null'] } }, required: ['numero', 'm2'] } },
}, required: ['regimen', 'conyuge', 'fincas'] };
const r = await generateText({ model: v('gemini-3.8-flash'), prompt: 'Ana, casada en separación de bienes (cónyuge no consta), vende la finca 12 (90 m²) y la 13 (superficie desconocida).',
  output: Output.object({ schema: jsonSchema(schema as any) }), providerOptions: { vertex: { thinkingConfig: { thinkingBudget: 0 } } } });
console.log(JSON.stringify(body.generationConfig.responseJsonSchema)); console.log(JSON.stringify(r.output));
