import { createVertex } from '@ai-sdk/google-vertex';
import { embedMany } from 'ai';
let url='', body: any;
const v = createVertex({ project: 'mycolegal-app', location: 'europe-west4', fetch: async (i, init) => { url=String(i); body=JSON.parse(String(init!.body)); return fetch(i as any, init); } });
const r = await embedMany({ model: v.embeddingModel('text-multilingual-embedding-002'), values: ['compraventa de vivienda', 'herencia'], providerOptions: { vertex: { taskType: 'RETRIEVAL_QUERY' } } });
console.log(url); console.log(JSON.stringify(body)); console.log(r.embeddings.length, r.embeddings[0].length);
