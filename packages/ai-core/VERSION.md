# @mycolegal-app/ai-core

## 0.1.0 — 3-oct-2026

Primera versión. Sube a paquete la fontanería de IA que estaba mal repartida por
la flota, por decisión de Carles (3-oct-2026).

**Qué trae, y de dónde venía:**

| Pieza | Estado anterior |
|---|---|
| `createTaskModelResolver` | **copiada en cuatro apps** (consultor, tributos, tramitación, platform); sus propios comentarios decían «calco reducido de consultor/tributos» |
| `createPromptCatalog` | el mecanismo (default del código, override de Admin, caída al código) copiado también; el **contenido** sigue siendo de cada app |
| `conversarConHerramientas` | **no estaba copiado**: estaba DENTRO de Consultor, pegado a sus resoluciones. Era lo que hacía imposible que otra app tuviera un MycoBot sin reescribirlo |

**Lo que NO trae, a propósito:** el transporte de Vertex
(`sharedlib/vertex`) y la resolución de endpoint por modelo
(`sharedlib/server/model-endpoint`), que ya estaban compartidos; y los prompts,
que son contenido.

**Los puertos son estructurales**, no `PrismaClient`: se pide lo mínimo que se
usa, para no arrastrar el tipado ni la versión de Prisma a los consumidores. Es
la misma lección que `ParrafoRepository` en `docfilling-core`.

**12 tests.** Los del bucle agéntico fijan lo que protege: el tope de vueltas
—sin él una pregunta mal planteada se come el presupuesto de tokens del día—,
que una herramienta que revienta le devuelve el error **al modelo** y no al
usuario, y que el consumo se acumula de todas las vueltas, sin lo cual no se
puede imputar.
