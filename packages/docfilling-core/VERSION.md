# @mycolegal-app/docfilling-core

## 0.1.45 — 11-nov-2026

Formato de salida `#words_f`: el número en letra para delante de un nombre femenino («una», «veintiuna», «treinta y una», «doscientas»; en catalán «una», «dues», «vint-i-una», «vint-i-dues», «dues-centes»). Los miles concuerdan («doscientas mil», «dues mil»); los millones no, que «millón» es masculino. Con `#words` y `#words_m` la hora del otorgamiento del testamento catalán salía «les dos hores», «les vint-i-un hores» (`PARR_PRELIMINARES`, aviso de Catálogo). `tests/formatos.test.ts`, `tests/manual.test.ts`.

## 0.1.44 — 11-nov-2026

Rendimiento, sin cambio de resultado (comparado con la 0.1.43 en los 237 esquemas de `_PROD`: expansión, `esquemaDeCampos` y `compose` idénticos, salvo la normalización NFC de abajo).

- **`parseFields` y `esquemaDeCampos` ya no tardan de 6 a 45 s la segunda vez.** La caché del índice de líneas de `offsetToLineCol` se quedaba con la cadena vieja, y `===` entre dos cadenas iguales que no son el mismo objeto compara el contenido entero: cada nueva generación del mismo esquema volvía a comparar los megas una vez por campo. 2.ª llamada: 0507 6,1 s → 0,16 s; 1103 23,7 s → 0,27 s; permuta 0503 44,8 s → 0,38 s. Ahora `parseFields` calcula su índice por llamada y la caché se queda con la cadena más reciente. `tests/offset-linea.test.ts`.
- **`expandirIncludes`, ~2× más rápido:** no analiza los párrafos sin `INCLUDE` y monta el texto una sola vez en vez de rehacerlo en cada sustitución (permuta 257 → 154 ms).
- **`expandirIncludes` normaliza a NFC cada párrafo**, no sólo la entrada. Dos párrafos de `_PROD` llevaban una interrogación griega (U+037E) por «;», y el texto expandido del 0507 y de la 0501 en PH dejaba de estar en NFC.

## 0.1.39 — 9-nov-2026

`{{DECLARE_UNDEF X=v}}`: un valor de respaldo, que sólo da valor a X si nadie se lo ha dado antes en el orden del documento expandido (0405, ACT-253: el `FALSE` de respaldo de tres párrafos pisaba el `TRUE` de la cabecera del esquema). Una declaración en una rama que no se toma no cuenta, un dato del caso no se pisa y un `DECLARE` posterior sigue ganando. Lo resuelve `resolverDeclarados(texto, campos)`, que usan `compose` y `composeForPreview`; `extractDeclareFixedValues` incluye el respaldo cuando nada lo fija antes, sin mirar ramas ni datos (las constantes que nadie pregunta). El parser lo lee como un `DECLARE` con `declareSoloSiIndefinido`; validador: `E050` cuenta aparte los respaldos, `E908` (`DECLARE_UNDEF ARRAY`) y `W914` (sin valor fijo). Además, el valor sin comillas de un `DECLARE` acaba en la primera `}`: `{{DECLARE X=TRUE}}{{ENDIF}}` daba «TRUE}}{{ENDIF» (ninguno en `_PROD`). `tests/declare-undef.test.ts`, `tests/manual.test.ts`.

## 0.1.36 — 4-nov-2026

`expandirIncludes(…, { marcarLengua })`: lo que sale de una sección en la lengua pedida va entre `LENGUA_APROBADA_INICIO` y `LENGUA_APROBADA_FIN`, para que quien traduce el resto se lo salte.

## 0.1.35 — 4-nov-2026

Secciones por lengua en un mismo fichero: `{{LANG-SECTION xx}}` … `{{LANG-END}}` (`src/syntax/lang-section.ts`). `expandirIncludes` las resuelve fichero a fichero con `opciones.idioma` (por defecto `es`) y cuenta en `sinSeccion` los bloques sin esa lengua; `auditarSeccionesDeLengua` comprueba que todas tengan la misma estructura. Las marcas no son campos, y un texto que llegue sin expandir sale en una sola lengua. Un fichero sin secciones no cambia. `tests/lang-section.test.ts`.

## 0.1.34 — 4-nov-2026

Formato de salida `#words_m`: el número en letra apocopado, para delante de un nombre masculino («un minuto», «veintiún minutos», «treinta y un días»; en catalán «vint-i-un»). Con `#words` las horas y los minutos del otorgamiento salían «uno minutos» (testamento catalán del informe de Javier). `tests/formatos.test.ts`.

## 0.1.17 — 7-oct-2026

`expandirIncludes` ignora los `{{INCLUDE}}` de las líneas `//`: ni los expande ni los cuenta como `faltantes`. `stripDirectives` ya borraba esas líneas al componer, así que el documento no cambia; lo que cambia es el grafo de la biblioteca, que avisaba de «faltan» por una inclusión retirada a propósito (la reducción aragonesa por inundaciones, caducada en 2015). `tests/include-comentado.test.ts`.

## 0.1.15 — 6-oct-2026

`processExitIncludes` quita también los **cierres** de INCLUDE huérfanos (`INC_END` sin su `INC_BEGIN`, cuando el INCLUDE abre dentro de un IF descartado y cierra fuera). Quedaban en la salida con sus `\x00` y hacían inválido el XML del `.docx`: la donación 0701 compuesta sin datos salía corrupta (ni Word ni LibreOffice la abrían). `tests/inc-end-huerfano.test.ts`.

## 0.1.14 — 6-oct-2026

`offsetToLineCol` deja de ser cuadrática: índice de inicios de línea (cacheado para el último texto) y búsqueda binaria. `parseFields` la llama una vez por campo y recontaba los `\n` desde el principio en cada llamada: con la compraventa 0501 expandida (2,7 MB, 1.341 campos) eran **7,4 s de los 7,6 s de `esquemaDeCampos`**, con el proceso de Redactor bloqueado mientras tanto. Mismo resultado, fijado por `tests/offset-linea.test.ts`.

## 0.1.1 — 3-oct-2026

Misma corrección que `ai-core@0.1.2`: el `exports` de los 7 subpaths sólo declaraba `import`, y un consumidor que resolviera por `require` fallaba con «No "exports" main defined». Añadida la condición `default`. No cambia nada del motor.

## 0.1.0 — 2-oct-2026

Arranque del paquete (F1 del plan `mycolegal-docfilling/PLAN_TECNICO_DOCFILLING_CORE.md`).

- Capa de **sintaxis** (`src/syntax/`: `constants`, `parser`, `validator`) y **composición**
  (`src/compose/engine.ts`) traídas de `DocFilling/docfilling-editor`, donde `scripts/gen-ts.py` las genera
  desde el paquete Python `docfilling-syntax`. 3.601 líneas.
- `includesDe()` — los INCLUDE de primer nivel de una plantilla, para la caché del catálogo.
- **139 casos de paridad** (82 de composición + 57 de validación) traídos del Python y verdes.
- Verificado además contra el **biblioteca real**: 1.727 markdown de producción del Drive `_PROD`.

- **Tres comprobaciones del validador que el generador no emite**, portadas a mano en
  `src/syntax/checks-pendientes.ts` y enchufadas por la envoltura `src/syntax/validate.ts` (para que
  regenerar no se las lleve): `checkDeclareArraySyntax` (E070/E071/W070/W071), `checkForEachBalance`
  (E060/E061/W082) y `checkSetDirectives` (E110/W110). Con ellas, el validador TS coincide con el Python
  en **1.722 de 1.727** ficheros reales; las 5 restantes son un error de posiciones del Python que no se
  replica a propósito.
- **`expandirIncludes`** — expansión recursiva sobre el puerto `ParrafoRepository`, con tope de
  profundidad, **detección de ciclos**, propagación de `FIELDS:_sfx`, reporte de `faltantes`/`usados` y
  **centinelas de EXIT_INCLUDE** (que en el Python sólo pone el editor, de modo que la directiva
  funcionaba al previsualizar y no al generar).
- **Dos arreglos de codificación** que la biblioteca real destapó: `\w` de JavaScript es ASCII y truncaba los
  nombres con tilde o Ñ (`PARR_LEY_CATALUÑA` → `PARR_LEY_CATALU`), y los ficheros del Drive llegan en
  **NFD** mientras las plantillas escriben en NFC, así que no se encontraban. Normalización a NFC en la
  frontera y clase Unicode en `INCLUDE_PATTERN`.

- **`esquemaDeCampos`** (F1.5) — port de `field_schema._parse` del SaaS: por campo, `quien` lo rellena
  (`ia`/`persona`/`solo`), tipo, etiqueta legible, opciones, instrucción, valor por defecto, arrays con
  subcampos, `soloCondicional` y ruta IUI; más los `includes` y las acciones humanas. Con él,
  `camposSoloCondicionales` e `instruccionesDeCampo`, portados de `filler.py` y **verificados contra el Python
  sobre los 1.727 ficheros reales con cero divergencias**.

Pendiente en el paquete (ver el plan): el mapa IUI con `MAP_IUI` (F1.6), el humanizador de etiquetas (F1.7),
`extractTemplateLang` y los ajustes de campo del `SettingsProvider`.
