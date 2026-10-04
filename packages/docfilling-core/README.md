# @mycolegal-app/docfilling-core

Motor DocFilling **texto→texto**: entra markdown con directivas y valores, sale markdown final.

```ts
import { compose, validateText, includesDe } from '@mycolegal-app/docfilling-core';

const md = compose('Hola {{NOMBRE}}.', { NOMBRE: 'Juan' });   // → 'Hola Juan.'
const { diagnostics } = validateText(plantilla);
const parrafos = includesDe(plantilla);                        // → ['PARR_X', …]
```

**No escribe `.docx`.** El documento se produce fusionando el markdown final con el `.docx` de referencia
de la notaría —estilos, fuentes, márgenes, interlineado, membrete y pie—, y eso vive en
`platform POST /internal/docx`. Ver `mycolegal-docfilling/PLAN_TECNICO_DOCFILLING_CORE.md` §8.

## De dónde viene el código

`src/syntax/` y `src/compose/engine.ts` se generan hoy desde el paquete Python `docfilling-syntax` con
`DocFilling/scripts/gen-ts.py`. Mientras el SaaS siga en Python, **el Python manda**: no editar esos ficheros a
mano, regenerarlos. Cuando el SaaS pase a TypeScript (D7 del plan), este paquete es la fuente única y el
generador se retira.

## La red

`tests/parity/` son **los mismos 139 ficheros de casos que corre el Python**. Si uno falla, el motor TS se ha
desviado del de referencia: se arregla el TS, nunca el caso.

`tests/oraculo-biblioteca.test.ts` compara el validador contra el Python sobre la biblioteca real del Drive. Se salta
por defecto; para correrlo hace falta el volcado del oráculo:

```sh
DOCFILLING_ORACULO=/ruta/py.json npx vitest run tests/oraculo-biblioteca.test.ts
```

## Estado

Ver `VERSION.md`.
