# F0 · Prueba del AI SDK contra Vertex

Prueba de la F0 de [`PLAN_TECNICO_CAPA_IA.md`](../../PLAN_TECNICO_CAPA_IA.md) §3.9, hecha el 21/22-nov-2026. **No es un paquete del workspace** (está fuera de `packages/*`) ni código de producción. Se guarda para repetir la prueba con otra versión del AI SDK o al empezar la F9.

- `f0.ts`: las cinco preguntas, más un extra de streaming. Intercepta `fetch` y guarda cada petición y su respuesta en `capturas/`.
- `p1b.ts`: P1 con `baseURL` explícito, para llamar a `v1` en lugar de `v1beta1`.
- `p4b.ts`: esquema con `enum`, `nullable` y listas a través de `responseJsonSchema`.
- `emb.ts`: embeddings `text-multilingual-embedding-002` con `task_type`.
- `capturas/`: cuerpos y respuestas reales de aquel día. Los datos son sintéticos y las cabeceras (credenciales) no se guardan. `resumen.json` tiene el resultado.

## Cómo repetirla

```bash
cd tools/capa-ia-f0
npm ci
gcloud auth application-default login   # ADC con permiso de Vertex en mycolegal-app
npx tsx f0.ts        # luego p1b.ts, p4b.ts, emb.ts
```

- Coste: menos de 0,05 € por pasada.
- P3 crea una caché `cachedContents` de unos 17.000 tokens, con caducidad de 300 s, y la borra al terminar.
- Para probar otra versión del SDK, fija la versión exacta en `package.json`, con al menos dos semanas desde su publicación.
