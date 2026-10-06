# @mycolegal-app/ai-core

## 0.1.4 — 7-oct-2026

`conversarConHerramientas` devolvía al modelo su turno RECONSTRUIDO con sólo los `functionCall`, y Gemini 3 exige de vuelta la `thoughtSignature` que acompaña a cada llamada: cualquier conversación que usara una herramienta fallaba en la segunda vuelta con un 400 («Function call is missing a thought_signature»). Ahora el turno del modelo vuelve entero, tal como llegó. Afectaba al MycoBot de la Librería de Redactor (el único consumidor) y al chat de la generación (F6). Test nuevo en `tests/agente.test.ts`.

## 0.1.2 — 3-oct-2026

El `exports` sólo declaraba la condición `import`, así que cualquier consumidor que no resolviera por ella —`tsx` tratando un `.ts` de la app como CJS, por ejemplo— moría con «No "exports" main defined», un mensaje que no dice nada de lo que pasa. Añadida la condición `default`, que cubre `require` y cualquier otra que venga.

## 0.1.1 — 3-oct-2026

El puerto de prompts pedía `overridePrompt` y la columna se llama **`prompt`**.
Lo cazó el tipado al cablear la primera app —`tsc` falló con «Property
'aiPrompt' is missing» y luego con la forma del `findMany`— en vez de romper en
caliente: es exactamente lo que un puerto estructural compra frente a pedir
`PrismaClient`.

Y de paso una diferencia que la copia original sí tenía y yo había perdido: sin
override se cae al `defaultPrompt` **de la base**, no al del código. Importa
porque si Admin ha revertido un prompt, la fila guarda el default con el que se
publicó, que puede ser anterior al del despliegue actual.

4 tests nuevos (16 en total).

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
