import { createVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
let url = '';
const v = createVertex({ project: 'mycolegal-app', location: 'eu',
  baseURL: 'https://aiplatform.eu.rep.googleapis.com/v1/projects/mycolegal-app/locations/eu/publishers/google',
  fetch: async (i, init) => { url = String(i); return fetch(i as any, init); } });
const r = await generateText({ model: v('gemini-3.8-flash'), prompt: 'Responde solo: hola' });
console.log(url, '→', r.text.trim(), JSON.stringify(r.usage));
