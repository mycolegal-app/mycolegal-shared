# PLAN TÉCNICO — Capa común de IA en `ai-core`: la plataforma, independiente de Vertex

> Estado: **F0 hecha (22-nov): `vertex-gemini` a mano, AI SDK para el resto; tipos cerrados. Siguiente: F1** · Fecha: 21-nov-2026 · Repo dueño: `mycolegal-shared` (`packages/ai-core`)
>
> **Repos afectados:**
> - `mycolegal-shared`: `ai-core` y, para vaciarlo, `sharedlib`.
> - `mycolegal-platform`: catálogo `ai_models`, OCR, transcripción, voz y comprobación de modelos.
> - `mycolegal-admin`: alta de modelos por adaptador.
> - Las apps que llaman a la IA: `consultor`, `redactor`, `web`, `tributos` y `tramitacion`.
>
> **Relación con otros planes:**
> - `mycolegal-platform/PLAN_TECNICO_LLM_LOCALES.md` **depende de este**: su F2 (proveedor de tipo OpenAI) es la F9 de aquí.
> - `mycolegal-platform/PLAN_TECNICO_ANONIMIZACION.md` encaja como una etapa más de la cadena de §3.4.
> - `mycolegal-platform/PLAN_TECNICO_CATEGORIAS_MODELO.md`: la resolución de tarea → categoría → modelo y la contingencia se conservan tal cual; solo cambian de sitio.
>
> Cuando llegue al 100 % → mover a `completed/`.

---

## 1. Objetivo

Las apps de MycoLegal **solo hablan con `ai-core`**, con una interfaz propia y neutra: qué tarea, qué mensajes, qué herramientas, qué forma de salida. **No saben qué proveedor responde.**

Cada interfaz de proveedor (Vertex/Gemini hoy; OpenAI-compatible, Anthropic, Mistral o vLLM mañana) es un **adaptador** dentro de `ai-core`. Añadir uno nuevo, o cambiar el modelo de una tarea a otro proveedor, **no toca ninguna app**: es un adaptador nuevo y una fila en el catálogo `ai_models`.

### Principios

1. **Las apps no ven ningún formato de proveedor.** Fuera de `ai-core` no aparece `candidates`, `generationConfig`, `functionDeclarations`, `aiplatform.googleapis.com`, `chat/completions` ni `rawPredict`. Lo vigila una comprobación automática (F8).
2. **Mismo comportamiento con Vertex.** El adaptador de Gemini envía **el mismo cuerpo, byte a byte**, que se envía hoy. La migración no cambia ninguna respuesta de producción (ver [[feedback_mycobot_no_alterar_respuestas_por_rendimiento]]).
3. **Lo transversal, una sola vez.** Reintentos, plazos, contingencia, anotación de tokens y créditos, IA grabada, simulación de falta de capacidad, métricas y, en el futuro, anonimización: hoy están repartidos entre `sharedlib`, `ai-core` y cada app.
4. **Fallar claro.** Si una tarea pide algo que su modelo no sabe hacer (PDF, audio, caché…), `ai-core` lo detecta antes de llamar y da un error con nombre, nunca un 400 opaco del proveedor.
5. **Secretos fuera de la BD.** El catálogo guarda la referencia a la clave, no la clave.

## 2. Situación actual (inventario del 21-nov-2026)

### 2.1 Qué hace hoy cada pieza compartida

| Pieza | Qué hace | Qué le pasa en este plan |
|---|---|---|
| `ai-core` 0.1.11 (444 líneas) | `createTaskModelResolver` (tarea → categoría → modelo, contingencia, razonamiento), `createPromptCatalog`, `conContingencia` / `turnoConContingencia`, simulación `IA_SIMULAR_SIN_CAPACIDAD` | Se conserva y pasa a ser el núcleo de la capa |
| `sharedlib/vertex.ts` (188) | Transporte: autenticación de Google, agente sin keep-alive, reintentos con backoff, plazos, `vertexUsage`, aviso de «llamada lenta» | Su lógica pasa al adaptador Gemini y a la cadena de etapas de `ai-core`. Queda obsoleto (F8) |
| `sharedlib/server/model-endpoint.ts` (117) | `endpointDeModelo`, `llmModelUrl`, `geminiOnlyUrl`: dónde se invoca cada modelo según `ai_models` | Pasa a ser el registro de modelos de `ai-core` (F3) |
| `sharedlib/server/llm-usage.ts` | `recordLlmCall`, `runWithUsageScope`, `collectedUsage`: anotación del consumo para créditos y Rentabilidad | Lo llama `ai-core`, una sola vez por llamada; ninguna app vuelve a llamarlo |
| Copias locales | `model-endpoint.ts` en Web y Platform; `geminiOnlyUrl` copiado en Consultor, Tributos y Tramitación | Se borran (F8) |

### 2.2 Dónde está acoplado a Gemini cada app

Recuento de usos en el código. **tool** = herramientas, **json** = `responseSchema`, **strm** = streaming, **cach** = `cachedContents`, **inl** = `inlineData` (imagen, PDF o audio en línea), **fdat** = `fileData`/`gs://`, **thnk** = razonamiento o `thoughtSignature`, **embd** = embeddings.

| Fichero | Líneas | tool | json | strm | cach | inl | fdat | thnk | embd |
|---|---|---|---|---|---|---|---|---|---|
| `consultor/src/lib/resoluciones/vertex.ts` | 757 | 11 | 2 | — | 10 | 4 | — | 19 | 9 |
| `consultor/src/lib/resoluciones/vertex-stream.ts` | 170 | 1 | — | 2 | — | — | — | 1 | — |
| `consultor/src/lib/descripcion/generar.ts` | 809 | — | — | — | 1 | — | — | 4 | — |
| `redactor/src/lib/vertex.ts` | 269 | 4 | — | 2 | 2 | — | — | 3 | — |
| `redactor/src/lib/ai.ts` | 203 | — | — | — | — | — | — | 5 | — |
| `redactor/src/lib/mycobot/agente.ts` | 197 | 12 | — | — | — | — | — | 2 | — |
| `redactor/src/lib/generacion/turno-chat.ts` | 224 | 2 | — | — | — | — | — | 1 | — |
| `redactor/src/lib/generacion/extraer.ts` | 705 | — | 2 | — | 3 | — | — | — | — |
| `redactor/src/lib/generacion/evaluacion-requisitos.ts` | 322 | — | 1 | — | 1 | — | — | — | — |
| `redactor/src/lib/generacion/{concordancia,traduccion,domicilio,clasificar-documento}.ts` | 1.269 | — | 7 | — | — | — | — | — | — |
| `redactor/src/lib/edicion/asistente.ts` | 136 | — | 1 | — | — | — | — | — | — |
| `web/src/lib/recepcion.ts` | 413 | 7 | — | — | — | — | — | 6 | — |
| `web/src/lib/cms-agent.ts` | 298 | 3 | — | — | — | — | — | 4 | — |
| `web/src/lib/creador-textos.ts` | 274 | — | 1 | — | — | — | — | 4 | — |
| `tributos/src/lib/normativa/vertex.ts` | 280 | — | 5 | — | — | — | — | 9 | 6 |
| `tributos/src/lib/normativa/extraccion.ts` | 571 | — | 2 | — | — | — | — | 3 | — |
| `tramitacion/src/lib/vertex-extract.ts` | 169 | — | 2 | — | — | — | 5 | 3 | — |
| `platform/src/lib/vertex-ocr.ts` | 136 | — | — | — | — | 4 | — | 5 | — |
| `platform/src/lib/vertex-transcribe.ts` | 158 | — | 2 | — | — | 2 | — | 7 | — |
| `platform/src/lib/vertex-tts.ts` | 206 | — | — | 2 | — | 2 | — | — | — |
| `platform/src/lib/vertex-probe.ts` | 144 | — | — | — | — | — | — | 1 | — |

**Dos situaciones distintas:**

- **Consultor ya tiene un envoltorio casi neutro**: `generateAnswer`, `generateWithTools`, `summarizeConversation`, que usan 28 ficheros. Migrar Consultor es cambiar el envoltorio, no sus 28 consumidores. Además ya despacha a Claude (`llmGenerate`, `rawPredict`) en el camino de texto.
- **Redactor expone el formato Gemini a sus consumidores**: `generar(model, cuerpo)` recibe un cuerpo Gemini ya montado y lo usan 10 módulos. Es la migración más grande: cada uno de esos módulos pasa a construir una petición neutra.

### 2.3 Lo que cada app hace por su cuenta y debería estar en la capa

- **IA grabada** (`redactor/src/lib/ia-grabada.ts`, 107 líneas): solo Redactor y solo Gemini. La clave de grabación se calcula sobre el cuerpo Gemini.
- **Bucles de herramientas**: hay tres (`redactor/mycobot/agente.ts`, `consultor generateWithTools`, `web recepcion/cms-agent`). La lección de la `thoughtSignature` (7-oct, [[feedback_gemini3_thought_signature]]) se aprendió en uno de ellos y hubo que replicarla a mano en los demás.
- **Caché explícita** (`cachedContents`): en Redactor y en Consultor, cada una a su manera.

## 3. Arquitectura

### 3.1 Capas

```
 apps (consultor, redactor, web, tributos, tramitacion, platform)
   │   solo importan @mycolegal-app/ai-core
   ▼
 ai-core · interfaz neutra   generar · generarEnVivo · conversar · embeber · transcribir · sintetizarVoz
   │
   ▼
 ai-core · cadena de etapas  candado de entorno → tarea→modelo → capacidades → [anonimización] →
   │                         IA grabada → simulación de capacidad → contingencia → reintentos y plazo
   ▼                         → (adaptador) → uso y créditos → métricas
 ai-core · registro de modelos   ai_models (adaptador, dirección, secreto, capacidades)
   │
   ▼
 ai-core · adaptadores   vertex-gemini │ openai-compatible │ anthropic │ (futuros)
   │
   ▼
 proveedores   Vertex (UE) │ OpenRouter / vLLM / Splash │ Vertex rawPredict · Anthropic
```

### 3.2 Módulos de `ai-core`

| Módulo | Contenido |
|---|---|
| `src/tipos.ts` | Tipos neutros (§3.3). **Ningún tipo de proveedor sale de `ai-core`** |
| `src/cliente.ts` | `createAiClient({ prisma, app, … })` → `{ generar, generarEnVivo, conversar, embeber, transcribir, sintetizarVoz }` |
| `src/cadena/*.ts` | Una etapa por fichero (§3.4), componibles y probables por separado |
| `src/registro.ts` | Registro de modelos: lee `ai_models` con caché de 60 s (lo que hoy es `model-endpoint`) y resuelve el adaptador |
| `src/capacidades.ts` | Ficha de capacidades y comprobación previa petición ↔ modelo |
| `src/adaptadores/vertex-gemini/*.ts` | Petición neutra ⇄ `generateContent`, `streamGenerateContent`, `cachedContents`, `:predict` (embeddings), TTS y audio |
| `src/adaptadores/openai-compatible/*.ts` | Petición neutra ⇄ `chat/completions`, `embeddings` y `audio/transcriptions` |
| `src/adaptadores/anthropic/*.ts` | Petición neutra ⇄ Messages (`rawPredict` en Vertex). Sale de Consultor |
| `src/errores.ts` | Errores con nombre (§3.6) |
| `src/modelo.ts`, `src/prompts.ts`, `src/contingencia.ts` | Lo que ya existe, sin cambios de comportamiento |

### 3.3 Interfaz neutra

Tipos **cerrados en F0 (22-nov)** tras revisar los 3 bucles de herramientas, los 9 sitios con `responseSchema` y las 22 llamadas que montan cuerpos Gemini (lo que salió de la revisión, debajo del bloque):

```ts
type Rol = 'usuario' | 'modelo' | 'herramienta';

type Parte =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'imagen'; mime: string; datos: Uint8Array | { uri: string } }
  | { tipo: 'documento'; mime: 'application/pdf' | string; datos: Uint8Array | { uri: string } }
  | { tipo: 'audio'; mime: string; datos: Uint8Array | { uri: string } }
  | { tipo: 'llamada'; id: string; nombre: string; argumentos: unknown }
  | { tipo: 'resultado'; id: string; nombre: string; resultado: unknown }; // objeto → tal cual; otro valor → { result: valor } (regla de Consultor)

interface Mensaje {
  rol: Rol;
  partes: Parte[];
  /** Estado propio del proveedor (p. ej. la thoughtSignature de Gemini). Solo lo lee su
   *  adaptador; las apps lo guardan y lo devuelven tal cual en la siguiente vuelta. */
  opaco?: unknown;
}

interface Herramienta { nombre: string; descripcion: string; parametros: JSONSchema }

type Salida =
  | { tipo: 'texto' }
  | { tipo: 'json'; esquema: JSONSchema; nombre?: string; ordenPropiedades?: boolean }; // ordenPropiedades → propertyOrdering (domicilio.ts)

type Razonamiento = 'ninguno' | 'bajo' | 'medio' | 'alto' | { presupuesto: number } | 'lo-decide-el-modelo';

interface Peticion {
  tarea: string;              // 'redactor:extraer_campos' → resuelve modelo, contingencia y razonamiento
  modelo?: string;            // solo si la tarea no gobierna el modelo (probes, bancos de pruebas)
  sistema?: string;
  mensajes: Mensaje[];
  herramientas?: Herramienta[];
  eleccionHerramienta?: 'auto' | 'ninguna' | 'obligatoria' | { nombre: string };
  salida?: Salida;
  razonamiento?: Razonamiento; // por defecto, el de la tarea o categoría
  temperatura?: number;
  maxTokens?: number;
  muestreo?: { semilla?: number; topP?: number; topK?: number }; // Tributos (extracción y juez)
  /** Lo que hoy es cachedContents. El `sistema` va SIEMPRE dentro de la caché junto al prefijo
   *  (así lo hacen Redactor y Consultor). Solo en ubicación UE; si no se puede crear, sigue
   *  sin caché enviándolo todo en línea y `uso.enCache = 0`. */
  cache?: { clave: string; prefijo: Mensaje[]; ttlSegundos: number };
  presupuesto?: { intentos?: number; timeoutMs?: number; deadlineMs?: number };
  etiquetas?: Record<string, string>; // para métricas y logs
}

interface Respuesta {
  texto: string;              // sin las partes de razonamiento
  json?: unknown;             // ya interpretado y validado contra el esquema si salida = json
  llamadas: { id: string; nombre: string; argumentos: unknown }[];
  mensaje: Mensaje;           // el turno del modelo COMPLETO, con su `opaco`, para empujarlo al historial
  uso: { modelo: string; entrada: number; salida: number; razonamiento: number; enCache: number };
  modelo: string;             // el que respondió (puede ser la contingencia)
  contingencia: boolean;
  finalizacion: 'fin' | 'limite' | 'herramienta' | 'bloqueo' | 'otro';
}

type Evento =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'llamada'; llamada: Respuesta['llamadas'][number] }
  | { tipo: 'fin'; respuesta: Respuesta };
```

**Operaciones:**

- `generar(p: Peticion): Promise<Respuesta>`
- `generarEnVivo(p: Peticion): AsyncIterable<Evento>`, para el streaming de Redactor, Consultor y voz.
- `conversar(p: Peticion & OpcionesConversacion): Promise<Respuesta & { vueltas: Vuelta[]; historial: Mensaje[] }>`. **Es el único bucle de herramientas de la flota.** Empuja siempre el `mensaje` completo del modelo, con su `opaco`, y suma el uso de todas las vueltas.

  ```ts
  interface OpcionesConversacion {
    ejecutar: (llamada: { id: string; nombre: string; argumentos: unknown }) => Promise<unknown>;
    maxVueltas: number;
    /** Ajustes por vuelta. Consultor: vuelta 1 con eleccionHerramienta 'obligatoria', la tarea
     *  barata de elegir herramienta y sin razonamiento; de la 2.ª en adelante, la de redactar. */
    porVuelta?: (n: number) => Partial<Pick<Peticion, 'tarea' | 'eleccionHerramienta' | 'razonamiento' | 'presupuesto' | 'maxTokens'>> & { enVivo?: boolean };
    /** Al agotar las vueltas, una más con este mensaje y eleccionHerramienta 'ninguna' (Redactor, 14-nov). */
    alAgotar?: { mensaje: string };
    /** Texto en vivo de las vueltas con enVivo (Consultor transmite la respuesta final). */
    alTexto?: (delta: string) => void;
  }
  interface Vuelta { n: number; modelo: string; ms: number; llamadas: string[]; contingencia: boolean }
  ```
- `embeber({ indice, textos }): Promise<number[][]>`. **El modelo lo fija el índice, no la tarea** (§3.8).
- `transcribir({ tarea, audio, idioma? }): Promise<{ texto: string; uso }>`
- `sintetizarVoz({ tarea, texto, voz }): Promise<{ audio: Uint8Array; mime: string; uso }>`, más su variante en vivo.

**Lo que salió al revisar (F0, 22-nov):**

- `systemInstruction` es siempre una sola parte de texto en los 22 sitios → `sistema: string` basta.
- Ningún sitio envía ni lee ids de `functionCall`; la respuesta va en rol `user` con `{ name, response }`. El adaptador Gemini genera los `id` para la interfaz neutra pero **no los envía** (paridad).
- `functionResponse.response` tiene que ser objeto: Redactor y Web ya pasan objetos; Consultor envuelve escalares y listas en `{ result }`. Esa regla pasa al adaptador.
- Modos de herramienta en uso: `ANY` (Consultor, 1.ª vuelta) y `NONE` (Redactor, vuelta de cierre) → `'obligatoria'` y `'ninguna'`. No se usan `allowedFunctionNames`, `safetySettings`, `labels`, `candidateCount`, `stopSequences` ni búsqueda de Google: quedan fuera de la interfaz hasta que algo los pida.
- Muestreo: solo Tributos (`seed`, `topP`) → `muestreo`.
- Esquemas: `enum` (11), `nullable` (5) y `propertyOrdering` (1, `domicilio.ts`) → JSON Schema con `enum`, `type: [x, 'null']` y `ordenPropiedades`.
- Partes de razonamiento (`thought`): todos los sitios las descartan del texto; nadie usa `includeThoughts` → `Respuesta.texto` sin ellas, sin evento propio.
- Bloqueos (`promptFeedback.blockReason`) → `ContenidoBloqueadoError`; Platform lo traduce a sus errores de transcripción y voz. `finishReason = MAX_TOKENS` → `finalizacion: 'limite'` (lo miran Consultor, Redactor, Tributos y OCR).
- Voz: `responseModalities: ['AUDIO']` + `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` → `sintetizarVoz({ voz })`.

**Esquema JSON:** las apps escriben JSON Schema estándar. El adaptador Gemini lo convierte al subconjunto OpenAPI que acepta `responseSchema`: tipos en mayúsculas, sin `$ref`, `nullable`. Para que la paridad sea exacta, la F2 incluye una tabla de conversión probada con todos los esquemas que existen hoy.

### 3.4 Cadena de etapas

Se ejecutan en este orden en cada llamada. Cada etapa es una función `(peticion, siguiente) => respuesta`.

| # | Etapa | Qué hace | Hoy está en |
|---|---|---|---|
| 1 | Candado de entorno | Un adaptador con la marca `soloLocal` no funciona si no está `AI_ADAPTADORES_LOCALES=1` (solo en el docker-compose de LOCAL) | — (nuevo) |
| 2 | Tarea → modelo | Categoría, modelo primario, contingencia, razonamiento y prompt de sistema editable | `ai-core` `createTaskModelResolver` |
| 3 | Capacidades | Cruza lo que pide la petición (herramientas, JSON, imagen, PDF, audio, caché, streaming) con la ficha del modelo. Si no encaja → `NoSoportadoError`. Si solo falta la caché, sigue sin ella y lo anota | `geminiOnlyUrl` (copiado en 5 sitios) |
| 4 | Anonimización | Etapa reservada para `PLAN_TECNICO_ANONIMIZACION` | — |
| 5 | IA grabada | Con `IA_GRABADA_DIR` y un usuario `@e2e-shared.local`: devuelve la respuesta grabada de una petición idéntica. La clave es el hash de la **petición neutra** + modelo | `redactor/src/lib/ia-grabada.ts` |
| 6 | Simulación de capacidad | `IA_SIMULAR_SIN_CAPACIDAD` | `ai-core` |
| 7 | Contingencia | Primario → contingencia ante falta de capacidad; pegajosa por turno en `conversar` | `ai-core` |
| 8 | Reintentos y plazo | Backoff, techo por intento y del conjunto, aviso de «llamada lenta» | `sharedlib/vertex.ts` |
| 9 | Adaptador | Traduce y llama | Cada app |
| 10 | Uso y créditos | `recordLlmCall` con el modelo que respondió y los tokens normalizados | `sharedlib/vertex.ts` + Redactor |
| 11 | Métricas | `[ia_contingencia]`, latencia, errores por adaptador | `ai-core` + `sharedlib` |

### 3.5 Adaptadores

| Adaptador | Interfaz | Autenticación | Cubre | Notas |
|---|---|---|---|---|
| `vertex-gemini` | `generateContent`, `streamGenerateContent?alt=sse`, `cachedContents`, `:predict`, TTS | Credenciales de Google (`google-auth-library`) | Todo lo de hoy: herramientas con `thoughtSignature`, `responseSchema`, `inlineData`, `fileData gs://`, `thinkingBudget` (3.x) y `thinkingLevel` (4.x), audio, voz y embeddings | **A mano** (decisión F0): reúne la traducción que ya existe en `sharedlib`, Redactor y Consultor. La dirección y la región salen del catálogo (`eu.rep`, `europe-west4`, `global`), como hoy |
| `openai-compatible` | `chat/completions` (+SSE), `embeddings`, `audio/transcriptions` | `Authorization: Bearer` con el secreto de `secretRef` | Texto, herramientas, `response_format: json_schema`, imagen (`image_url` con data URI), razonamiento (`reasoning`) y streaming | **Sobre el AI SDK** (`@ai-sdk/openai-compatible`). Para OpenRouter, vLLM, Splash (mac-mini-ai) y Mistral (que también habla este formato). **Sin** PDF, `gs://` ni caché explícita. Audio y embeddings, según el servidor |
| `anthropic` | Messages vía Vertex `rawPredict` | Credenciales de Google | Texto, herramientas, imagen y PDF (Claude los lee) | **Sobre el AI SDK** (`@ai-sdk/anthropic` / `@ai-sdk/google-vertex/anthropic`). Hoy solo cubre el texto de Consultor. Se mueve aquí y se completa. **Prioridad baja:** sin cuota en Vertex UE (ver [[project_banco_traduccion_modelos]]) |
| *(futuros)* | Mistral nativo, Anthropic directo, Bedrock… | — | — | Un fichero nuevo y una fila en el catálogo; **sin tocar apps** |

**Cosas de cada proveedor que el adaptador tiene que resolver:**

- **Gemini:** la `thoughtSignature` va y vuelve por `Mensaje.opaco`. `cachedContents` se crea y reutiliza dentro del adaptador a partir de `Peticion.cache`. `gs://` solo con `datos.uri` y adaptador Gemini. Los tokens de razonamiento (`thoughtsTokenCount`) cuentan como salida (decisión del 26-oct).
- **OpenAI-compatible:** los `tool_call_id` se generan y se guardan en `Parte.id`. Los argumentos llegan como cadena JSON y hay que interpretarlos con tolerancia. Hay modelos que no admiten `json_schema`: en ese caso `json_object` + validación + un reintento. El uso sale de `usage.prompt_tokens`, `completion_tokens` y `completion_tokens_details.reasoning_tokens`.
- **Anthropic:** el `system` va arriba; `tool_use` / `tool_result`; `max_tokens` es obligatorio.

### 3.6 Errores con nombre

| Error | Cuándo | Qué hace la cadena |
|---|---|---|
| `SinCapacidadError` | 429 o 503 del proveedor, cola llena, o simulación | Contingencia |
| `NoSoportadoError` | La petición pide algo que el modelo no sabe hacer | **No** reintenta. Mensaje claro con tarea, modelo y capacidad que falta |
| `AutenticacionError` | 401/403, secreto ausente | No reintenta. Aviso en Salud |
| `PlazoAgotadoError` | Techo del conjunto | Como hoy |
| `ContenidoBloqueadoError` | Filtro de seguridad del proveedor | No reintenta. Se registra |
| `RespuestaInvalidaError` | JSON que no cumple el esquema tras el reintento | Se registra con la respuesta cruda |

### 3.7 Configuración: catálogo `ai_models`

**Migración en platform**, dueña de la tabla, más el espejo de solo lectura en el `schema.prisma` de `consultor`, `redactor`, `web`, `tributos` y `tramitacion`:

| Columna | Tipo | Hoy | Nuevo |
|---|---|---|---|
| `adaptador` | `text` | — | `vertex-gemini` · `openai-compatible` · `anthropic`. Relleno inicial: `provider = google` → `vertex-gemini`, `anthropic` → `anthropic` |
| `provider`, `verb` | `text` | Publisher y verbo de Vertex | Se conservan durante la transición (las apps viejas los leen) y se retiran en F8 |
| `host`, `location` | `text` | Dirección y región de Vertex | `host` pasa a significar «dirección base» en cualquier adaptador (p. ej. `eu.openrouter.ai/api/v1`). `location` se conserva para Vertex y para la marca UE |
| `modeloProveedor` | `text?` | — | Id del modelo en el proveedor si difiere del `modelId` interno (p. ej. `mistralai/mistral-large-4-0`), para no tener ids con `/` en las tareas |
| `secretRef` | `text?` | — | Nombre de la variable de entorno con la clave (p. ej. `LLM_KEY_OPENROUTER`). **Nunca la clave** |
| `soloLocal` | `bool` | — | `true` para lo que solo debe funcionar en LOCAL (etapa 1) |
| `capacidades` | `jsonb` | `audio`, `tts` (columnas) | `{ herramientas, json, imagen, pdf, audio, voz, cache, streaming, razonamiento, contextoMax }`. Lo rellena la comprobación de F9 y se edita en Admin. `audio` y `tts` se conservan hasta F8 |

**Secretos:** en Cloud Run, del Secret Manager vía `apps.json`, con su permiso IAM ([[feedback_secreto_nuevo_sin_iam_rompe_deploy]]). En LOCAL, en el `.env` del docker-compose. Mientras solo haya adaptadores `soloLocal`, en TEST y PROD no hace falta ningún secreto nuevo.

### 3.8 Embeddings

- Hoy: `text-multilingual-embedding-002` (`VERTEX_EMBED_MODEL`), **fuera** de `ai_task_models`. Los vectores son `vector(768)` en 6 columnas de Consultor y 1 de Tributos.
- En la capa, `embeber` recibe el **índice** (`corpus_doctrina`, `normativa`…), no la tarea. Cada índice fija su modelo y su dimensión en el código. Mezclar vectores de dos modelos en un índice rompe la búsqueda sin dar ningún error.
- **Cambiar de modelo de embeddings no forma parte de este plan.** Exige reindexar el corpus y, si cambia la dimensión, migrar las columnas. Es la F4 de `PLAN_TECNICO_LLM_LOCALES`. Aquí solo se mueve la llamada a la capa.

### 3.9 ¿Capa propia o sobre el AI SDK de Vercel?

El AI SDK (`ai`) ya tiene proveedores para Vertex, OpenAI-compatible, Anthropic y Mistral, además de herramientas, objetos con esquema, streaming, embeddings, transcripción y voz. **Si se adopta, solo cambia el interior de los adaptadores.** Los tipos neutros de §3.3 siguen siendo nuestros: ningún tipo del AI SDK sale de `ai-core`, para poder cambiarlo sin tocar las apps.

**F0 decide con cinco preguntas, todas contra Vertex real en LOCAL:**

1. ¿Deja fijar la dirección `aiplatform.eu.rep.googleapis.com` con `location = eu`?
2. ¿Conserva y reenvía la `thoughtSignature` en un bucle de herramientas de 3 vueltas con `gemini-3.8-flash`?
3. ¿Admite `cachedContents` explícito, creado y reutilizado?
4. ¿Se puede obtener el cuerpo exacto que envía, para la paridad de F2 y la IA grabada?
5. ¿Pasa `thinkingLevel` (Gemini 4) y `thinkingBudget` (3.x) tal cual?

**Criterio:** con cinco síes, adaptadores sobre el AI SDK. Con un no en 1, 2 o 4, capa propia. Un no en 3 o 5 se puede resolver dentro del adaptador si el AI SDK deja pasar opciones propias del proveedor.

**Resultado de F0 (21-nov-2026, `ai@7.0.164` + `@ai-sdk/google-vertex@5.0.133`, Vertex `mycolegal-app`, datos sintéticos, coste < 0,05 €):**

| # | Pregunta | Resultado | Detalle |
|---|---|---|---|
| 1 | Host EU con `location = eu` | **Sí** | Usa `aiplatform.eu.rep.googleapis.com` de serie, pero con `v1beta1`. Con `baseURL` explícito llama a `v1`, como hoy |
| 2 | `thoughtSignature` en bucle de 3 vueltas (`gemini-3.8-flash`) | **Sí** | 4 peticiones, todas 200; las 6 `functionCall` reenviadas llevan su firma. La firma sale en `response.messages` (`providerOptions`), así que cabe en `Mensaje.opaco` |
| 3 | `cachedContents` | **Sí, a medias** | Usar una caché: sí (`providerOptions.vertex.cachedContent`, 17.222 tokens leídos de caché). Crearla y borrarla: el SDK no lo hace; lo hace el adaptador con REST, como hoy |
| 4 | Cuerpo exacto | **Sí, capturable**; **no idéntico** | Se captura entero con un `fetch` propio. Diferencias con el de hoy: envía `responseJsonSchema` (JSON Schema estándar) en vez de `responseSchema` (OpenAPI), y otro orden de claves. `nullable` pasa a `type: [x, "null"]`; `enum` y listas funcionan (probado en vivo); `propertyOrdering` desaparece (manda el orden de `properties`) |
| 5 | `thinkingBudget` (3.x) y `thinkingLevel` (4.x) | **Sí** | Pasan tal cual por `providerOptions.vertex.thinkingConfig`; sin opciones no añade nada por su cuenta |
| + | Streaming, embeddings, `gs://` | Sí | `streamGenerateContent?alt=sse`; `text-multilingual-embedding-002` con `task_type` → 768 dimensiones; `gs://` va como `fileData`. El uso trae el `usageMetadata` crudo (sirve para `recordLlmCall`) |

**Lectura:** por el criterio, **adaptadores sobre el AI SDK**. El precio es el principio 2: con el SDK la paridad con Vertex es **semántica, no byte a byte** (`responseJsonSchema` en lugar de `responseSchema`). Si se acepta, F2 compara cuerpos normalizados y respuestas reales de los 9 sitios con esquema; si no, el adaptador `vertex-gemini` se escribe a mano (capa propia solo para Gemini) y el SDK se usa para los demás proveedores. Script y capturas: scratchpad de la sesión, `f0-aisdk/`.

**Decisión (22-nov, Carles):** **`vertex-gemini` a mano**, con paridad byte a byte (principio 2 intacto), y **AI SDK para los demás adaptadores** (`openai-compatible`, `anthropic`, futuros), con versión exacta fijada. Motivos: todo el tráfico de producción es Gemini y no debe cambiar ninguna respuesta; la traducción Gemini ya existe en el código y solo se reúne; el SDK ahorra trabajo justo en los proveedores que no tenemos y su ritmo de versiones queda lejos del camino de los clientes. Es reversible: si más adelante los 9 sitios con esquema salen iguales con el SDK, Gemini puede pasar al SDK sin tocar apps.

## 4. Fases

Estimación total: **16–19 jornadas**.

### F0 · Prueba del AI SDK y cierre del diseño (1 j)
- [x] Script en el scratchpad con las cinco preguntas de §3.9 contra Vertex en LOCAL.
- [x] Resultado anotado en §3.9 y decisión en §8 (22-nov): Gemini a mano, AI SDK para el resto.
- [x] Tipos de §3.3 cerrados (22-nov): añadidos `muestreo`, `ordenPropiedades`, regla de `resultado`, `cache` con el sistema dentro y solo UE, y `OpcionesConversacion` (`porVuelta`, `alAgotar`, `alTexto`, `vueltas`).

### F1 · Núcleo de `ai-core` (2 j)
- [ ] `tipos.ts`, `errores.ts`, `cliente.ts` y la cadena (§3.4) con un adaptador de pruebas en memoria.
- [ ] Mover a `ai-core` lo que hoy está en `sharedlib`: reintentos y plazo, anotación de uso (sigue llamando a `recordLlmCall` de `sharedlib/server/llm-usage`, que **no** se mueve: lo usa también la facturación) y aviso de llamada lenta.
- [ ] IA grabada genérica (etapa 5), con la misma semántica que la de Redactor: `IA_GRABADA_DIR`, usuarios `@e2e-shared.local`, cabecera `x-ia-grabada: no`, y la normalización de `GEN-AAAA-N` y de la hora.
- [ ] Pruebas unitarias por etapa: contingencia, candado, capacidades, reintentos e IA grabada.
- **Hecho cuando:** `ai-core` tiene la interfaz completa y la prueba de la cadena pasa con el adaptador de pruebas. Ninguna app cambia todavía.

### F2 · Adaptador `vertex-gemini` con paridad exacta (3 j)
- [ ] `generar`, `generarEnVivo`, `conversar` (con `opaco` = `thoughtSignature`), `cache` (`cachedContents`), imagen, PDF y audio en línea, `gs://`, `thinkingBudget`/`thinkingLevel`, embeddings `:predict` y voz.
- [ ] **Pruebas de paridad:** capturar en LOCAL el cuerpo que envía hoy cada uno de los 24 sitios de §2.2, por ejemplo con un interruptor de entorno que escriba el cuerpo en un fichero. Comprobar que el adaptador, a partir de la petición neutra equivalente, produce **el mismo JSON**. Una prueba por sitio.
- [ ] Conversión JSON Schema → `responseSchema` probada con todos los esquemas actuales.
- [ ] Normalización de la respuesta: `candidates` → `Respuesta`, incluido `finishReason` → `finalizacion` y los bloqueos de seguridad.
- **Hecho cuando:** las 24 pruebas de paridad pasan y la contabilidad de tokens coincide con la de hoy en las respuestas capturadas.

### F3 · Catálogo y registro de modelos (1 j)
- [ ] Migración en `platform` (§3.7) con el relleno de `adaptador` desde `provider`.
- [ ] Espejo de `AiModel` en los 5 `schema.prisma` consumidores (solo lectura, sin migración propia, como hoy).
- [ ] `registro.ts` en `ai-core`. `sharedlib/server/model-endpoint.ts` queda como envoltorio obsoleto que delega, para las apps aún sin migrar.
- [ ] La materialización de categorías de `PLAN_TECNICO_CATEGORIAS_MODELO` sigue intacta: `ai_task_models` no cambia.

### F4 · Migración, tanda 1: Tramitación y Tributos (1,5 j)
- [ ] Tramitación: `vertex-extract.ts` → `generar` con `documento { uri: gs://… }` y salida JSON. Borrar su `geminiOnlyUrl`.
- [ ] Tributos: `normativa/vertex.ts` y `extraccion.ts` → `generar` con salida JSON (extracción y juez) y `embeber({ indice: 'normativa' })`.
- [ ] Specs afectados en LOCAL. Comparar 10 extracciones reales antes y después: tiene que salir el mismo JSON (Vertex a temperatura 0 es casi determinista).
- **Por qué primero:** son pequeñas, tienen JSON con estructura fija y fileData, y validan la paridad sin herramientas ni streaming.

### F5 · Migración, tanda 2: Web y Platform (2 j)
- [ ] Web: `recepcion.ts` y `cms-agent.ts` → `conversar`; `creador-textos.ts` → `generar` con JSON. Borrar `web/src/lib/model-endpoint.ts`.
- [ ] Platform: `vertex-ocr.ts` (imagen/PDF), `vertex-transcribe.ts` (`transcribir`), `vertex-tts.ts` (`sintetizarVoz` en vivo) y `vertex-probe.ts` (pasa a ser la comprobación por adaptador de F9). Borrar `platform/src/lib/model-endpoint.ts`.
- [ ] Specs afectados de Web (recepción, CMS) y de MycoBot por voz en LOCAL.

### F6 · Migración, tanda 3: Consultor (2 j)
- [ ] Reescribir por dentro `generateAnswer`, `generateWithTools`, `summarizeConversation` y `llmGenerate` sobre `ai-core`, **sin cambiar su firma**: los 28 consumidores no se tocan.
- [ ] `vertex-stream.ts` → `generarEnVivo`. La caché de doctrina → `Peticion.cache`. Embeddings → `embeber({ indice: … })`. `descripcion/generar.ts` → `generar`.
- [ ] El despacho a Claude de `llmGenerate` sale de Consultor: lo hace el adaptador `anthropic`.
- [ ] Casos del Revisor y specs de MycoBot doctrina en LOCAL. Comparar 10 respuestas de doctrina antes y después (mismas citas).

### F7 · Migración, tanda 4: Redactor (3 j)
- [ ] `vertex.ts`: `generar`, `generarDeTarea` y `generarEnVivo` pasan a recibir una petición neutra. Los 10 módulos de §2.2 dejan de construir cuerpos Gemini.
- [ ] `mycobot/agente.ts` y `turno-chat.ts` → `conversar`. Se borra la copia temporal del bucle (deuda de F6 de `PLAN_TECNICO_REDACTOR_UI`).
- [ ] Caché explícita de `extraer.ts` y `evaluacion-requisitos.ts` → `Peticion.cache`.
- [ ] `ia-grabada.ts` → se borra; la hace la etapa 5. **Una sola vez se pierde lo grabado**, porque la clave pasa a calcularse sobre la petición neutra: hay que volver a grabar (~1,5 € por pasada completa).
- [ ] Runner de escrituras de referencia (0501) y suite de Redactor completa una vez en LOCAL (ver [[feedback_e2e_test_solo_antes_de_prod]]).

### F8 · Cierre y guardas (1 j)
- [ ] Comprobación automática en cada repo de app, en las pruebas o en el build: prohibido fuera de `node_modules/@mycolegal-app/ai-core` `aiplatform.googleapis.com`, `candidates[`, `generationConfig`, `functionDeclarations`, `responseSchema`, `chat/completions`, `rawPredict` y `google-auth-library` para llamadas de IA.
- [ ] Retirar `sharedlib/vertex.ts` y `sharedlib/server/model-endpoint.ts` (o dejarlos como envoltorios marcados obsoletos si algo fuera de las apps los usa), y las columnas `provider`, `verb`, `audio` y `tts` de `ai_models`.
- [ ] Documentación: `ai-core/README.md` con la interfaz, la cadena y cómo se escribe un adaptador.

### F9 · Adaptador `openai-compatible` y Admin (2,5 j)
- [ ] Adaptador completo (§3.5) sobre `@ai-sdk/openai-compatible`, traduciendo `Peticion`/`Respuesta` ⇄ `generateText`/`streamText` y `Mensaje.opaco` ⇄ `providerOptions`; pruebas unitarias de traducción con respuestas de ejemplo.
- [ ] Comprobación por adaptador: una llamada real mínima por capacidad (texto, herramienta, JSON, imagen) que rellena `capacidades`. Admin › Modelos IA disponibles: alta por adaptador con dirección base, `modeloProveedor`, `secretRef` y `soloLocal`.
- [ ] Prueba real en LOCAL contra **mac-mini-ai** (Splash) y/o **OpenRouter**, según lo que haya. Asignar desde Admin una tarea de cada tipo (texto, herramientas, JSON, streaming) y comprobar que funciona **sin tocar ninguna app**.
- **Hecho cuando:** se cumple el criterio de aceptación 3 de §6. A partir de aquí `PLAN_TECNICO_LLM_LOCALES` puede seguir con su F3.

### F10 · Opcional
- [ ] Completar el adaptador `anthropic` cuando haya cuota de Claude en Vertex UE.
- [ ] Adaptador `mistral` nativo, si su interfaz OpenAI-compatible se queda corta (OCR o audio de Mistral).

## 5. Despliegue

- **Cada tanda (F4–F7) se publica y se prueba en LOCAL por separado:** publicar `ai-core` (y `sharedlib` si cambia), subir la dependencia **y el lockfile** de las apps de la tanda, y lanzar sus specs afectados. Hay que avisar antes a Lanzamiento ([[feedback_avisar_antes_de_desplegar_local]]) y publicar solo lo propio ([[feedback_publish_shared_arrastra_cambios_ajenos]], [[feedback_publicar_shared_no_sube_lockfile_de_consumidoras]]).
- **TEST y PROD, solo con el OK expreso de Carles**, por tandas, y PROD siempre después de TEST verificado ([[feedback_no_desplegar_test_prod_sin_ok]], [[feedback_prod_siempre_despues_de_test_verificado]]).
- La migración de `ai_models` (F3) es aditiva y puede ir a TEST/PROD antes que las apps: las apps viejas siguen leyendo `provider`, `verb`, `host` y `location`.
- **Marcha atrás:** cada app migrada se revierte volviendo a la versión anterior de `ai-core` en su `package.json`. Mientras dure la transición (F3–F7), el envoltorio obsoleto de `sharedlib` sigue funcionando.
- Mientras `openai-compatible` sea `soloLocal`, **en TEST y PROD solo funciona `vertex-gemini`** (y `anthropic` donde ya existía), con el mismo comportamiento de hoy.

## 6. Criterios de aceptación

1. **Paridad:** con Vertex, las 24 llamadas de §2.2 envían el mismo cuerpo que antes (pruebas de F2), y los créditos y Rentabilidad cuentan los mismos tokens.
2. **Independencia:** la comprobación de F8 pasa en las seis apps. Ninguna importa nada de proveedor.
3. **Extensibilidad:** con F9 hecha, asignar en Admin una tarea a un modelo `openai-compatible` funciona en LOCAL sin cambiar ningún fichero de ninguna app.
4. **Fallar claro:** asignar a `platform:transcripcion` un modelo sin audio da `NoSoportadoError` con tarea, modelo y capacidad en el mensaje, y Admin lo avisa al asignar.
5. **Sin regresión:** el runner de escrituras de referencia, los casos del Revisor y los specs afectados de cada tanda dan el mismo resultado que antes de migrar.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| La migración cambia respuestas de producción sin que se note | Paridad byte a byte en F2 y comparación de respuestas reales en cada tanda |
| Se rompe el bucle de herramientas de Gemini por la `thoughtSignature` | `Mensaje.opaco` + `conversar` único + prueba de 3 vueltas en F0 y F2 |
| Se pierde el ahorro de la caché explícita | `Peticion.cache` probado en F2; comparar `cachedContentTokenCount` antes y después en Redactor |
| La IA grabada se invalida | Ocurre una vez en F7 (la clave pasa a la petición neutra). Volver a grabar una pasada completa (~1,5 €) |
| Publicar `shared` arrastra cambios ajenos o deja apps con el lockfile viejo | Publicar solo lo propio y subir el lockfile por app (memorias citadas en §5) |
| El AI SDK cambia de versión a menudo | Sus tipos no salen de `ai-core`, la versión se fija exacta y solo lo usan los adaptadores que no sirven producción (decisión F0) |
| Migración larga con dos caminos conviviendo | Tandas cortas (F4–F7), envoltorio obsoleto mientras dura y F8 para cerrarla |
| Embeddings mezclados de dos modelos | `embeber` va por índice con modelo fijo (§3.8) |

## 8. Decisiones

| Fecha | Decisión | Quién |
|---|---|---|
| 21-nov-2026 | La plataforma debe ser **independiente de Vertex**, con una capa común de intermediación en `ai-core` que permita añadir interfaces nuevas sin tocar las apps | Carles |
| 21-nov-2026 | **Plan propio** (este), no una fase de `PLAN_TECNICO_LLM_LOCALES` | Carles |
| 22-nov-2026 | F0: **`vertex-gemini` a mano** (paridad byte a byte) y **AI SDK** (`ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, versión exacta) para el resto de adaptadores. Resultado de las 5 preguntas en §3.9 | Carles |

## 9. Preguntas abiertas

1. **Alcance de la primera versión:** ¿transcripción, voz y embeddings desde la tanda en que se migra su app (como está escrito), o solo texto en la primera vuelta y el resto después? Lo escrito evita dejar caminos de Vertex sueltos.
2. **¿Se migra también `consultor/descripcion/generar.ts`** (809 líneas, Catastro), o se deja para el final de F6 si se complica?
3. **Comprobación de F8:** ¿en las pruebas de cada app (vitest) o como paso del build/deploy? Lo primero es más simple; lo segundo no se puede saltar.

## Fuera de alcance

- Elegir o cambiar modelos de ninguna tarea: lo hace Admin, como hoy.
- Cambiar el modelo de embeddings o reindexar el corpus: `PLAN_TECNICO_LLM_LOCALES` F4.
- La anonimización: `PLAN_TECNICO_ANONIMIZACION`; aquí solo queda su etapa reservada.
- Activar `openai-compatible` en TEST o PROD: decisión aparte, con datos de calidad de `PLAN_TECNICO_LLM_LOCALES`.
