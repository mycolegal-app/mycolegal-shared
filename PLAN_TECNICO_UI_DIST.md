# PLAN TÉCNICO — Migración de `@mycolegal-app/ui` a `dist` compilado (compile-no-bundle)

**Estado:** ✅ COMPLETADO (Fases 0–4). `@mycolegal-app/ui@2.0.0` (dist) publicado y adoptado por las 13 apps (React 19 + ui@^2.0.0), `transpilePackages` de ui retirado en las 13 (Fase 4, builds verdes), todo commiteado+pusheado. `optimizePackageImports` conserva ui. PENDIENTE solo: desplegar (manual, deploy-all.sh) escalonado + vigilar CI.
**Repo:** `mycolegal-shared` · package `packages/ui`
**Fecha:** 2026-08-21

## EJECUCIÓN (21-ago-2026)
- Publicado `@mycolegal-app/ui@2.0.0` vía `tools/publish-package.sh ui` (major: cambio raw-TS→dist; el caret ^1.99 no salta a 2.x, así que la adopción fue manual/deliberada en las 13, no por caret). GH Actions publicó OK, verificado en registry.
- **Hallazgo tardío (lucide-react):** las 5 apps migradas a React 19 tenían `lucide-react@0.363.0` (peer `react<=18`). Los builds pasaban con node_modules ya poblado, pero un `npm install` limpio fallaba (ERESOLVE). Fix: bump a `^1.9.0` (versión que ya usaban las 7 apps React-19-originales). Lección: la migración de un major de React exige bumpear TODA dep con techo de peer en la versión anterior; validar con `npm install` limpio, no solo `next build`.
- Smoke-test runtime OK (notaria+consultor `/login` 200, HTML correcto, sin errores React).
- Builds verdes contra el dist 2.0.0 publicado en ≥7 apps (migradas + originales); las 13 instalan ui@2.0.0 sin conflictos.
- Commit+push de las 13 apps (deploy.yml es CI Test&Build, NO despliega → push seguro; deploy es central/manual vía deploy-all.sh).

## Fase 4 — HECHA (21-ago-2026)
`transpilePackages: "@mycolegal-app/ui"` retirado de las 13 (dejando sharedlib/text-extract; `optimizePackageImports` conserva ui). Builds verdes consumiendo el dist directamente. Commiteado+pusheado. admin queda con `transpilePackages: []` (no consumía sharedlib/text-extract).

## PENDIENTE (fuera de este plan)
- **Desplegar** (manual, `deploy-all.sh`) escalonado — es un major de React; empezar por 1-2 apps y verificar en prod.
- Vigilar los runs de CI de los pushes.

## RESULTADO DEL GATE (ejecutado 21-ago-2026)
- ✅ `tsc` preserva `"use client"` (95/95) y emite 1:1 (153=153).
- ✅ Build `ui` limpio (0 err) con `next`/`jose` como devDeps + `@types/node/react/react-dom` en `tsconfig.build.json`. `server/rls.ts` usa bound estructural `{ $transaction: (...args:any[])=>any }` (el paquete no puede generar `@prisma/client`).
- ✅ `exports` map: entradas EXPLÍCITAS para los 7 dir-index (`components/{admin,help,i18n,layout,manual}`, `server/{admin,catalogs}`) — el wildcard NO resuelve dir-index en turbopack, ni el array-fallback. `tokens/*.css` y `globals.css` se quedan TOP-LEVEL (postcss-import no respeta `exports`). `tailwind-preset` necesita condición `default` (tailwind lo carga vía `require`).
- ✅ Next 16 buildea con **turbopack** por defecto (resolver estricto — el caso duro).
- ✅ Builds verdes contra dist: notaria+consultor (React-18-migradas) y peticiones+tributos (React-19). Los 83 subpaths de las 13 apps resuelven contra `exports` (check estático).

## ⚠️ RESTRICCIÓN DE ORDEN (crítica)
Las 6 apps migradas a React 19 (admin, archivo, notaria, consultor, legifirma, tramitacion) tienen el bump SIN commitear. Como los consumidores cogen el dist por caret `^1.99.x` en su próximo deploy, **hay que commitear (y desplegar) el React 19 de esas 6 apps ANTES de publicar el ui-dist** — si no, una app aún React-18-en-git que despliegue cogería el dist (con `.d.ts` React-19) y rompería el build. Orden seguro: (1) commit React 19 en las 6 apps → (2) publicar ui-dist → (3) Fase 4 gradual.

## 1. Objetivo

Dejar de publicar `@mycolegal-app/ui` como **TS crudo** (`main: ./index.ts`, consumido vía `transpilePackages` en las 13 apps Next) y pasar a publicar un **`dist` compilado, sin bundlear**, con `exports` map, `sideEffects` y tipos `.d.ts`.

### Por qué (contexto que lo justifica)
- Los 13 consumidores instalan el **tarball publicado y versionado** (`^1.99.x` desde GH Packages), NO un symlink de workspace. El beneficio DX de `transpilePackages` (edición en vivo) **no aplica**: ya pagáis publish+bump de todos modos.
- Cada app **re-transpila TODO el source de `ui` en cada build** → coste ×13 en CI que se elimina compilando una vez arriba.
- tree-shaking, `exports` map y `optimizePackageImports` pasan a ser el **camino trillado** que los bundlers esperan, en vez de casos borde por el input raw-TS.
- Tipado aislado: los consumidores compilan contra `.d.ts` prebuilt, no contra el TS interno del paquete.

### Principio central (NO negociable)
**Compilar, NO empaquetar** (`compile-no-bundle`): 1 archivo fuente → 1 módulo en `dist`. Nada de concatenar. Es lo que:
- preserva el tree-shaking a nivel de módulo (un servicio que usa `LoadingSpinner` no arrastra Tiptap),
- mantiene la estructura de deep-imports (`dist/components/...`) para que los import strings de los consumidores **no cambien**,
- respeta las fronteras RSC de los **96 componentes `"use client"`** (bundlear rompería la semántica de la directiva).

> Un `dist` grande en `node_modules` es irrelevante para el bundle del servicio: lo que acopla es *cómo* se compila, no cuántos packages hay. **No hace falta partir en packages granulares.** La granularidad necesaria es a nivel de módulo, y es gratis con compile-no-bundle.

## 2. Non-goals (fuera de alcance de este plan)
- **NO** partir `ui` en varios packages publicados (multiplica el bump atómico; no aporta sobre compile-no-bundle + peers opcionales).
- **NO** migrar `sharedlib` ni `text-extract` aquí (pueden seguir en `transpilePackages`; este plan es solo `ui`).
- **NO** mover deps pesadas a peers opcionales todavía (es el paso 3 posterior, más limpio sobre `dist`).

## 3. Hechos del paquete (baseline)
- `name: @mycolegal-app/ui`, `version: 1.99.22`, `type: module`, `main: ./index.ts`, sin `exports`.
- Ya aplicado (trabajo previo, sin publicar): `sideEffects: ["**/*.css"]`.
- Barrel `index.ts`: ~110 re-exports **nombrados y explícitos** (sin `export *`) → analizable estáticamente.
- **96/113** componentes con `"use client"`; **0** `"use server"`.
- Directorios: `components/` (114 archivos), `hooks/`, `lib/`, `server/` (24, importan `next/server` y `google-auth-library`), `i18n/`, `tokens/*.css`, `assets/`, `globals.css`, `e2e/`.
- `tsconfig.json` sin `outDir` (no hay build completo hoy); existe `build:e2e` (tsc → `e2e/*.js`) usado por Playwright.
- Deps pesadas hoy como `dependencies` (no peers): `@tiptap/*`+`turndown`+`marked`, `@tanstack/react-table`, `@dnd-kit/*`, `cmdk`, `html2canvas`.
- Subpaths que consumen las apps (deben seguir resolviendo): `.`, `./components/*`, `./hooks/*`, `./lib/*`, `./server/*`, `./i18n`, `./tokens/*.css`, `./globals.css`, `./package.json`, `./e2e/*` (Playwright, Node sin transpilar).
- 13 consumidores Next `^16`; algunos con `turbopack: {}`.

## 4. Decisión de herramienta

**Primario: `tsc`** (con un `tsconfig.build.json` nuevo). Razones:
- Nunca bundlea → compile-no-bundle es inherente (1:1).
- Preserva la directiva `"use client"` como *directive prologue* (igual que `"use strict"`).
- Genera `.d.ts` + `.d.ts.map` nativos.
- Ya está en uso (`build:e2e`); cero dependencia de bundler nueva.
- Contra: no copia CSS/assets → se añade un script de copia trivial.

**Alternativa: `tsup` con `bundle:false` + `preserveModules:true` + `dts:true`** (manejo explícito de `"use client"` vía banner, más ergonómico). Elegir solo si el gate de directivas con `tsc` (Fase 0) diera problemas.

## 5. Fases

### Fase 0 — Gate de viabilidad (bloqueante, ~1h)
Antes de comprometerse, validar el único riesgo real:
1. Crear `tsconfig.build.json` (ver Fase 1) y compilar **un** componente `"use client"` (p.ej. `command-palette.tsx`).
2. Verificar que el `.js` emitido **conserva `"use client"` en la primera línea**.
3. Verificar que emite **un archivo por módulo** (no concatenado).
4. Compilar el paquete entero y hacer `next build` de **2 apps representativas**: una webpack (`config`) y una turbopack (`notaria`), apuntando al `dist` local. Confirmar 0 `can't resolve` y que una ruta con `"use client"` hidrata en runtime.

**Si la directiva no se preserva con `tsc` → cambiar a `tsup` y repetir el gate.** No avanzar sin este gate en verde.

### Fase 1 — Build en `packages/ui`
- `tsconfig.build.json`:
  ```jsonc
  {
    "extends": "./tsconfig.json",
    "compilerOptions": {
      "outDir": "dist",
      "rootDir": ".",
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "noEmit": false
    },
    "include": ["index.ts", "components/**/*", "hooks/**/*", "lib/**/*", "server/**/*", "i18n/**/*", "tailwind-preset.ts"],
    "exclude": ["node_modules", "e2e/**/*", "**/*.test.ts", "**/*.test.tsx", "scripts/**"]
  }
  ```
- Script de copia de assets → `dist`: `globals.css`, `tokens/*.css`, `assets/**`. (`cp`/`copyfiles`; determinista, sin fechas.)
- `e2e/` sigue con su `build:e2e` propio (Playwright, Node) — **no** entra en el `dist` principal; se publica aparte como hoy.
- Scripts:
  ```jsonc
  "scripts": {
    "build": "tsc -p tsconfig.build.json && node scripts/copy-assets.mjs",
    "build:e2e": "tsc -p tsconfig.e2e.json",
    "prepublishOnly": "npm run build && npm run build:e2e"
  }
  ```
- `.gitignore`: añadir `dist/` (no versionar output).

### Fase 2 — `package.json` con `exports` (import strings de consumidores SIN cambios)
Objetivo: que `@mycolegal-app/ui/components/shared/loading-spinner` resuelva a `dist/components/shared/loading-spinner.js` **sin tocar el código de los consumidores**.
```jsonc
{
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": ["**/*.css"],
  "exports": {
    ".":               { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./components/*":   { "types": "./dist/components/*.d.ts", "import": "./dist/components/*.js" },
    "./hooks/*":        { "types": "./dist/hooks/*.d.ts", "import": "./dist/hooks/*.js" },
    "./lib/*":          { "types": "./dist/lib/*.d.ts", "import": "./dist/lib/*.js" },
    "./server/*":       { "types": "./dist/server/*.d.ts", "import": "./dist/server/*.js" },
    "./i18n":           { "types": "./dist/i18n/index.d.ts", "import": "./dist/i18n/index.js" },
    "./tokens/*":       "./dist/tokens/*",
    "./globals.css":    "./dist/globals.css",
    "./tailwind-preset": { "types": "./dist/tailwind-preset.d.ts", "import": "./dist/tailwind-preset.js" },
    "./e2e/*":          "./e2e/*.js",
    "./package.json":   "./package.json"
  },
  "files": ["dist", "e2e", "package.json"]
}
```
Puntos críticos verificados contra el uso real:
- `./package.json` explícito → lo hace `require_()` el `next.config` en **Node**.
- `./e2e/*` → `./e2e/*.js` **compilado** (Playwright, Node sin transpilar). Import con extensión implícita: confirmar en el gate que Playwright resuelve `.../e2e/shared-lock-fixture`; si exige `.js`, mapear el basename exacto o ajustar el import del consumidor.
- Directorios con `index` (`help`, `layout`, `manual`, `i18n`, `admin`) → el wildcard `./components/*` resuelve `dist/components/help/index.js` en webpack; **validar en turbopack** (gate). Si turbopack no resuelve el index bajo wildcard, añadir entradas explícitas para esos 5 directorios.
- **Ojo:** `exports` cierra el paquete. Antes de mergear, correr el grep de todos los subpaths (§3) y comprobar que cada uno matchea un patrón.

### Fase 3 — Publicación (nuevo minor, retrocompatible)
- Publicar como **nuevo minor** (p.ej. `1.100.0`), **no** major: los import strings no cambian, así que no es breaking a nivel de API.
- **Retrocompatibilidad clave:** un `dist` de JS-ESM **sigue funcionando con el `transpilePackages` actual** de los consumidores (transpilar JS ya compilado es un no-op inocuo). ⇒ **rollout gradual, sin big-bang:** al publicar, todas las apps siguen construyendo igual; el bump solo activa el `dist`.

### Fase 4 — Retirar `transpilePackages: "@mycolegal-app/ui"` por app (claim del ahorro CI)
- Por cada app, en su turno: bump de `@mycolegal-app/ui` al minor nuevo + **quitar solo `"@mycolegal-app/ui"`** del array `transpilePackages` (dejar `sharedlib`/`text-extract`). Mantener `optimizePackageImports` (sigue ayudando al barrel sobre `dist`).
- `next build` verde por app = ahorro de re-transpilación materializado.
- Es aquí donde aplica el bump atómico ([[feedback_shared_pkg_bump_atomic]]): hazlo app por app, no las 13 a la vez.

## 6. Checklist de validación (por fase)
- [ ] Fase 0: `"use client"` preservado en `.js` emitido (grep primera línea).
- [ ] Fase 0: emisión 1:1 (nº de `.js` en `dist/components` ≈ nº de fuentes).
- [ ] Fase 0: `next build` OK en `config` (webpack) **y** `notaria` (turbopack) contra `dist` local.
- [ ] Fase 0: ruta con componente cliente hidrata sin error de "client boundary".
- [ ] Fase 2: los ~30 subpaths reales (§3) matchean el `exports` map (grep + build).
- [ ] Fase 2: `require('@mycolegal-app/ui/package.json')` funciona en Node (next.config lee versión).
- [ ] Fase 2: Playwright resuelve `@mycolegal-app/ui/e2e/shared-lock-fixture`.
- [ ] Fase 4: build verde en cada app tras quitar `transpilePackages`.
- [ ] Medir antes/después: tiempo de `next build` de 1 app + tamaño de bundle de una ruta ligera (`source-map-explorer`).

## 7. Riesgos y mitigación
| Riesgo | Prob. | Mitigación |
|---|---|---|
| `tsc` no preserva `"use client"` | Baja | Gate Fase 0; fallback a `tsup` con banner |
| Bundle accidental rompe fronteras RSC | Media si se usa bundler mal configurado | Regla compile-no-bundle; `preserveModules` si `tsup` |
| `exports` cierra un subpath en uso | Media | Grep exhaustivo §3 + build de las 13 antes de publicar |
| turbopack no resuelve index bajo wildcard | Media | Validar en gate; entradas explícitas para los 5 dirs con index |
| CSS/assets no copiados a `dist` | Baja | Script de copia + checklist |
| Regresión en una app al quitar transpilePackages | Baja | Rollout gradual app por app; `dist` es no-op bajo transpilePackages |

## 8. Secuencia global (dónde encaja este plan)
1. **[HECHO, sin publicar]** `sideEffects` + `optimizePackageImports` en los 13 configs (peldaño previo, no se tira). Ver [[project_ui_tree_shaking]].
2. **[ESTE PLAN]** Migración a `dist` compile-no-bundle + `exports`.
3. **[POSTERIOR]** Deps pesadas → `peerDependencies` opcionales (mucho más limpio sobre `dist`; ojo GH Packages oculta peer-meta [[feedback_github_packages_peermeta]] y cada consumidor debe declararlas [[feedback_optional_peer_must_declare_if_used]]).

## 9. Estimación
- Fase 0 (gate): ~1h. **Si falla, se para aquí sin coste de migración.**
- Fases 1–3: ~½ día.
- Fase 4 (13 apps, gradual): ~1–2h repartidas, a ritmo de bump.
