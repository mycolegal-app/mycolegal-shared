# PLAN TÉCNICO — Línea Oro / Línea Plata: acento de acción por familia de apps

**Estado:** 🔧 IMPLEMENTADO EN LOCAL (15/16-sep-2026) — F0–F4 hechas en working tree de shared/peticiones/tramitacion/notaria; tipan y `next build` verde en las 3 apps contra `ui` sincronizada a mano en node_modules. **Pendiente:** publicar `ui@3.1.0` (`tools/publish-package.sh ui`, desde main) → bump de consumidoras en el mismo commit que el código → deploy local (Carles) → pase visual → resto de apps oro a `mc-action-*` (mecánico, sin cambio visible).
**Repo:** `mycolegal-shared` (`packages/ui`) para F0; luego `mycolegal-peticiones`, `mycolegal-tramitacion`, resto de apps
**Fecha:** 2026-09-15
**Origen:** informe de revisión UI Peticiones/Tramitación vs Notaría + propuesta Línea Plata (artefactos de sesión: `claude.ai/artifact/MrCqMcTnBrDnEbtBXGrR1H` y `claude.ai/artifact/59sDKVVKjUYSkt6XSrEKAc`)

## Decisión

El color de **acción** (botón primario, enlace en tabla, chip/pestaña activa, paso actual del stepper, foco, fondos suaves de aviso) sigue al logo de la app:

| | Línea Oro | Línea Plata |
|---|---|---|
| Apps | Notaría, LegiFirma, Consultor, Archivo, Pólizas, Tributos, Config, Admin (logo oro `#FFE9B3→#DDA85A→#9A6A1F`) | Peticiones, Tramitación (logo plata `#F4F7FA→#AEB7C0→#6E7884→#454E57`). `cancelaciones-bs` = plata de base + azul Sabadell como acción (caso whitelabel) |
| Botón primario | `cyan-600` → hover `cyan-700` (como hoy en Notaría) | `slate-700` → hover `slate-900` (= `Button` default actual) |
| Enlace en tabla | `cyan-700`, subrayado en hover | `slate-900` **siempre subrayado** (decoración `slate-400`, offset 3px) |
| Chip / pestaña activa | `bg-cyan-50 border-cyan-300 text-cyan-700` | relleno sólido `bg-slate-800 text-white` |
| Paso actual (stepper) | `cyan-500` | `slate-900`; hecho = verde en ambas |
| Foco | `ring-cyan-500` | `ring-slate-500` (5.06:1, ya calibrado AA) |
| Fondo suave (avisos, preview) | `cyan-50/40` | `slate-50` |
| Icono/avatar sidebar | `bg-cyan-500/20 text-cyan-400` | `bg-slate-300/20 text-slate-200` (único guiño metálico) |
| Neutros de superficie | `mc-neutral` (cálidos) | `mc-slate-50/100` (fríos) — **decidido: sí** |
| Marca (no acción) | oro `mc-primary`: logo, banner MycoLegalTech | plata: logo, banner. **Oro nunca aparece** |
| Estados (verde/ámbar/rojo/azul), banda azul, sidebar navy, tipografía | **idénticos en las dos líneas** | |

Regla de pertenencia: no "quién la usa" sino "de qué lado del mostrador está el trabajo". Tramitación es el back-office del circuito B2B (comparte modelo, estados y bandejas con Peticiones) → plata aunque la use personal de la notaría.

Razones: (1) la escala `--mc-slate` ya tiene la temperatura del logo plata; (2) el `Button` compartido por defecto ya es `bg-mc-slate-700`; (3) el whitelabel del portal (`portalColorAccent` por notaría) necesita una base neutra sobre la que inyectar el color de cada despacho.

## Mecánica: un token, no dos códigos

```css
/* packages/ui/tokens/colors.css — por defecto Línea Oro */
:root {
  --mc-action-50: var(--mc-cyan-50); … --mc-action-900: var(--mc-cyan-900);
  --mc-action-ring: var(--mc-cyan-500);
  --mc-surface-soft: var(--mc-neutral-50);
}
:root[data-brand="silver"] {
  --mc-action-50: var(--mc-slate-50); … --mc-action-900: var(--mc-slate-900);
  --mc-action-ring: var(--mc-slate-500);
  --mc-surface-soft: var(--mc-slate-50);
}
```

- `tailwind-preset.ts`: `colors.mc.action.{50..900}` → clases `bg-mc-action-600`, `text-mc-action-700`, `ring-mc-action-ring`… Las páginas nunca saben en qué línea están.
- `Button` compartido: nueva variante `primary: "bg-mc-action-600 text-white hover:bg-mc-action-700"`. Nadie vuelve a escribir `bg-cyan-600` / `bg-mc-primary-600` a mano.
- Cada app de plata pone `data-brand="silver"` en `<html>` (root `layout.tsx`).
- Dos matices que el token no resuelve solo y se codifican en los componentes compartidos con `[data-brand="silver"]` (no en páginas): enlace subrayado permanente (`NavLink`/clase de enlace de tabla) y chip activo sólido (chip de filtro, `UnderlineTabs`).
- Whitelabel: `peticiones/src/app/[slug]/layout.tsx` sobrescribe `--mc-action-*` desde `portalColorAccent` (función que genera la escala 50–900 a partir de un hex). Plata = neutro por defecto sin personalización.

Nota: hoy `cyan-*` está definido en el preset (no como CSS vars). Para que `--mc-action-*` pueda apuntar a cian hay que introducir `--mc-cyan-*` en `colors.css` (mismos hex que el preset) y hacer que el preset lea de las vars.

## Fases

### F0 — Librería (`packages/ui`) · sin cambio visible
- [x] `tokens/colors.css`: `--mc-cyan-*`, `--mc-action-*`, `--mc-action-ring`, `--mc-surface-soft`, bloque `[data-brand="silver"]`.
- [x] `tailwind-preset.ts`: `mc.action.*`, `mc.cyan.*` desde vars.
- [x] `Button`: variante `primary`.
- [x] Extraer de Notaría a `ui`: `EstadoTimeline` genérico (`steps[]`, `current`, `cancelled`), `UnderlineTabs` (con contador opcional), `SegmentedToggle`, chip de filtro (`FilterChip`). Todos sobre `mc-action-*` y con variante plata.
- [x] Subir de Tramitación a `ui`: `FormModal` / `FormSection` / `Field` (`forms/form-modal.tsx`) con clases de Notaría (`rounded-md`, label `text-sm font-medium`, foco `mc-action-ring`). Constante `INPUT_CLS` exportada.
- [x] `AppSidebar`: accent por defecto derivado de `data-brand` (evitar el prop `accent` a mano).
- [x] `AppShell`: pintar la banda siempre (título de reserva = `appName`) para que una página sin `PageTitle` no la haga desaparecer (bug B-2).
- [x] `EstadoPeticionesConsole`: prop para retirar el hero (`h1` + botón) o retirarlo; botón a `Button primary`.
- [ ] (pendiente) Muestrario `packages/ui/e2e` o página estática con `data-brand` conmutable para QA visual de las dos líneas.
- [x] `UI_GUIDELINES.md` en `packages/ui` con el canon de página (tabla §1 del informe) y esta tabla de roles. Sustituye al `UI-ASSESMENT.md` que citan 28 comentarios y ya no existe.
- [ ] Release de `ui` (minor) — versión fijada a 3.1.0 en package.json; publicar con `tools/publish-package.sh ui` desde main.

### F1 — Bugs (independientes de la línea)
- [x] B-1 `LangToggle` fuera del cuerpo blanco (13 páginas: Peticiones `peticiones/[id]`, `mi-entidad/*`, `mi-gestoria/*`, `solicitudes-bandeja`, `accesos-por-usuario`; Tramitación `mantenimientos/*`, `solicitudes-bandeja`). Idioma vía `UserAccountDialog` o un único `HeaderActions` en el layout.
- [x] B-2 `PageTitle` en las páginas sin banda (Tramitación `actas/[id]`, `actas/nueva`, `actas/bmn-correlacion`, `actas/admin/tipos-actas/*`, `admin/externos`, `*/[id]/tipos`, `expedientes/[id]/calificacion`; Peticiones `peticiones/[id]/expediente`). Enlaces a `/actas/${id}` con `?dom=`.
- [x] B-3 Campana duplicada: quitar `NotificationsBell` de `HeaderActions` en `peticiones/(dashboard)/layout.tsx`.
- [x] B-4 Literales a `t()`: Tramitación `sidebar.tsx:71-80` (7), `(dashboard)/page.tsx` fallos recepción, `UrgenteBadge`, `actas/[id]` "Firmar y asignar protocolo"; Peticiones `peticiones/[id]/expediente/page.tsx`.
- [x] B-5 `<main>` anidados (7 ficheros Tramitación) → `<div>` sin padding propio.
- [x] B-6 `toLocaleDateString()` sin locale (22 Tramitación, 3 Peticiones) → `formatDate/formatDateTime` de `ui/lib/utils`.

### F2 — Peticiones → plata (piloto)
- [x] `data-brand="silver"` en root layout.
- [x] Migrar `cyan-*` y `mc-primary-*` en rol de acción → `mc-action-*` (~60 puntos); botones a `Button primary`; tiles dorados fuera.
- [x] Patrón de página en las 12 páginas hero: retirar `h1` inline, `className="p-6"`, `max-w-*`; acciones a la banda (`PageShell` o idiom Notaría).
- [x] Bandeja `peticiones/page.tsx`: chips `FilterChip` con contador inline en una fila (separador por app) en vez de tarjetas `text-2xl`; `DataTable scrollable fillParent`; columna Estado con `StatusBadge` + mapa `estado→variant`; prioridad como badge; `rowClassName` con `border-l-4` por estado.
- [x] `expedientes/page.tsx`: `DataTable`, Nº como enlace, estado con badge, sin UUIDs.
- [x] Detalle `peticiones/[id]`: cabecera Notaría (badges + info-bar + acciones `text-xs`), `EstadoTimeline`, `UnderlineTabs` (Datos / Mensajes / Documentos), sección "Sección 1ª" de indigo a paleta, modales a `Dialog`.
- [x] Home banco: `KpiCard`; home gestoría: consola sin hero.
- [x] Neutros fríos (vía tokens `--mc-surface-soft`/`--mc-border` en `[data-brand=silver]`): revisar fondos `bg-gray-50` → `bg-mc-slate-50` donde sean superficie.
- [ ] (pendiente, requiere endpoint de branding por orgId en auth) Whitelabel: el dashboard inyecta `--mc-action-*` desde `portalColorAccent`.

### F3 — Tramitación → plata (por lotes independientes)
- [x] Lote 1: `data-brand="silver"`; `mc-primary-*` en rol de acción → `mc-action-*` (~220: 70 botones, 72 enlaces, 69 chips, 5 rings); `cyan-*` restantes → `mc-action-*`; `DomainTabs` sobre `UnderlineTabs` (fuera los hex `#f3efe6/#8a774f`); tabs de `actas/[id]` (`blue-600`) idem.
- [x] Lote 2: `CatalogPageShell` y `StubPage` reescritos sobre `PageShell` (sin hero, "Crear" a la banda) → cubre catálogos y mantenimientos de una vez.
- [x] Lote 3: detalles `peticiones/[id]`, `expedientes/[id]`, `actas/[id]`: cabecera Notaría + `EstadoTimeline` (macro-fases de `lib/resumen/macro-fases.ts`) + `StatusBadge` (retirar `EstadoBadge`/`UrgenteBadge`); radios `rounded-xl`→`rounded-lg` en tarjetas, `rounded-lg`→`rounded-md` en botones/inputs; `max-w-3xl` fuera.
- [x] Lote 4: sidebar a densidad compartida (o prop `density="compact"` en `AppSidebar` para todo el menú, no la mitad); formularios restantes a `FormModal/Field`/`INPUT_CLS`; `rose-*`→`red-*`, purple/indigo/fuchsia fuera; `LoadingSpinner`/`EmptyState`.

### F4 — Resto de la flota → `mc-action-*` + guardarraíles
- [x] Notaría: `cyan-`→`mc-action-` (794 ocurrencias, sed) y botones a `Button primary`. Sin cambio visible. Resto de apps oro igual.
- [x] Script de lint/grep (CI o `deploy.sh`) que falle ante: `bg-cyan-600`/`bg-mc-primary-600`/`bg-mc-slate-700` en botones a mano; `<h1` en página que monta `PageTitle`; `className="p-6"` en `app/`; `<main` fuera del shell; `toLocaleDateString()` sin argumentos; hex literales en clases; literales con acento fuera de `t()`.

## Riesgos y mitigaciones
- Gris sobre gris → acento plata oscuro (700–900), estados en color, enlace subrayado, chip activo sólido.
- Primario / secundario / deshabilitado se parecen → tres formas: sólido grafito / contorno blanco / relleno `slate-50` sin borde + `opacity-50`. Nunca gris medio sólido para deshabilitado.
- Contraste → texto de acción 700+ (≥8:1); `slate-500` solo foco y metadatos.
- Doble QA visual → muestrario con `data-brand` conmutable, revisado por release de `ui`.

## Fuera de alcance (deuda común, anotar aparte)
`confirm()` nativo (31/7/72), `next/link` directo en Notaría (24 ficheros), modales artesanales de Notaría (8 en `expedientes/[id]`), `<select>` nativo vs Radix.

## Añadido en 3.1.0 (16-sep-2026): diálogos de confirmación
- `ui`: `ConfirmDialog` (declarativo), `ConfirmProvider` (montado en `AppShell`), `useConfirm()` / `useAlert()` / `usePrompt()` (imperativos, sustitutos 1:1 de los nativos; Esc y click fuera cancelan; foco inicial en Cancelar si `tone="destructive"`; `requireText` para irreversibles; `action` async con spinner y error inline). Claves `ui.confirm.*` en los 4 JSON.
- Migrados los 120 `confirm()/alert()/prompt()` de Peticiones (11), Tramitación (79) y Notaría (30) por codemod + 12 ajustes a mano (funciones a `async`, hooks en componentes sin `useI18n`). Guardarraíl nuevo en `ui-guardrails.sh`.
- Pendiente de afinar a mano (funcionan, pero el texto es el del nativo): títulos que eran preguntas largas con `\n` (ExternosTable) y los `alert` de error (título = mensaje); el `tone` se dedujo por palabra clave (borrar/anular/desactivar…).

## Notas de ejecución (16-sep-2026)
- Guardarraíles: `mycolegal-shared/tools/ui-guardrails.sh <app>…` — pasa limpio en Peticiones y Tramitación; Notaría arrastra deuda previa (hex `#b09a6e`, `rounded-xl`, orange/violet) fuera de alcance.
- `AppShell` pinta la banda siempre (título de reserva = `appName`): el bug B-2 queda cerrado a nivel de librería aunque una página olvide `PageTitle`.
- `PageTitle`/`PageShell` aceptan `icon` (lo usan `CatalogPageShell`, `StubPage`).
- Tramitación: `lib/estado-visual.ts` centraliza variantes de badge, bordes de fila y pasos del stepper por dominio (cancelaciones, copias, actas). `EstadoBadge` pasa a envolver `StatusBadge`.
- Notaría: `components/expedientes/estado-timeline.tsx` envuelve el `EstadoTimeline` compartido (misma API local).
- Peticiones: `/api/expedientes` devuelve `_count.peticiones`; la bandeja acepta `?expedienteId=`.
- Acta detail (`actas/[id]`) sigue con literales castellanos en `lib/actas/estado-machine.ts` (`ETIQUETA`) y en varias secciones (deuda i18n del dominio, no de este plan).
- Resto de apps oro (legifirma, consultor, archivo, pólizas, tributos, config, admin) siguen con `cyan-*` literal: renderizan igual (el preset conserva `cyan`); migrarlas a `mc-action-*` es un sed por repo en el momento del bump a `ui@3.1.0`.
