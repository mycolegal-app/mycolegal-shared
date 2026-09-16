# UI_GUIDELINES — canon de página de las apps MycoLegal

Referencia normativa para toda página de dashboard de cualquier app `mycolegal-*`. Sustituye al antiguo `UI-ASSESMENT.md` (que citan comentarios del código y ya no existe). Origen: revisión UI de sep-2026 y `mycolegal-shared/PLAN_TECNICO_LINEA_PLATA.md`.

## 1. Dos líneas, un código

El color de **acción** sigue al logo de la app. El resto (banda azul, sidebar navy, tipografía, estados) es idéntico.

| | Línea Oro | Línea Plata |
|---|---|---|
| Apps | Notaría, LegiFirma, Consultor, Archivo, Pólizas, Tributos, Config, Admin | Peticiones, Tramitación (y base neutra del whitelabel: cancelaciones-bs) |
| Activación | nada (default) | `<html data-brand="silver">` en el root `layout.tsx` |
| `mc-action-*` resuelve a | cian (`--mc-cyan-*`) | grafito (`--mc-slate-*`) |
| Enlace en tabla | acento, subrayado en hover | acento oscuro, **siempre subrayado** |
| Chip / pestaña activa | fondo suave + borde acento | relleno sólido grafito + texto blanco |
| Neutros de superficie | cálidos (`mc-neutral`) | fríos (`mc-slate-50/100`) |
| Estados (verde / ámbar / rojo / azul) | idénticos | idénticos |

**Regla de oro:** las páginas escriben `mc-action-*`, nunca `cyan-*`, `mc-primary-*` ni `mc-slate-700` en rol de acción. Los matices por línea viven en los componentes compartidos (`[[data-brand=silver]_&]:`), no en las páginas.

## 2. Envoltorio de página

```tsx
// Lista con DataTable
<div className="flex h-full min-h-0 flex-col">
  <PageTitle title=… subtitle=… />
  <HeaderActions>
    <Button variant="header" size="sm">Imprimir</Button>
    <Button variant="primary" size="sm"><Plus/> Nuevo</Button>
  </HeaderActions>
  <FilterChip … />   {/* fila de chips */}
  <DataTable … scrollable fillParent toolbar={…} />
</div>

// Formulario / tarjetas
<PageShell title=… subtitle=… actions={…}>…</PageShell>
```

- **Siempre** `PageTitle` (o `PageShell`). La banda azul se pinta aunque no haya título (muestra el nombre de la app), pero una página sin título es un bug.
- **Nunca** `<h1>` inline: la banda ya muestra el título.
- **Nunca** `className="p-6"`, `max-w-*` centrados ni `<main>` propios: el `<main>` del shell ya lleva `p-6` y el contenido es a ancho completo.
- Las acciones de página van en la banda (`HeaderActions`), no en el cuerpo. Imprimir/Excel/CSV con `variant="header"`; la acción principal con `variant="primary"`.
- El selector de idioma **no** va en el cuerpo (está en el diálogo de cuenta). Si una app lo necesita en la banda, se monta una vez desde el layout.
- La página **no hace scroll**: el `DataTable fillParent` o el contenedor interno del detalle scrollea.

## 3. Bandeja (lista)

- Fila de `FilterChip` (`rounded-full`, contador inline) sobre la tabla; `FilterChipDivider` entre grupos; `tone="warning"` para atributos derivados de urgencia.
- `DataTable` con `source` (servidor) cuando hay paginación real; `scrollable fillParent`; toolbar con controles `INPUT_SM_CLS` (`h-8 rounded-md text-xs`).
- El **Nº es el enlace** al detalle: `className={ACTION_LINK_MONO_CLS}`. Sin columna "Ver".
- Estado con `StatusBadge` + mapa `código → variant` (`default | info | warning | success | destructive | secondary`) y tooltip. `rowClassName` con `border-l-4 border-l-<color>` por estado en las bandejas principales.
- Fechas con `formatDate` / `formatDateTime` de `@mycolegal-app/ui` (nunca `toLocaleDateString()` sin locale).
- Vacío: `EmptyState`. Carga: `LoadingSpinner size="lg"` centrado en `h-40`.

## 4. Detalle

```
PageTitle (título = "Expediente #N — Acto", subtítulo = cliente)
┌ fila: [StatusBadge] [badges secundarios]         [acciones text-xs a la derecha]
│       info-bar: iconos 3.5 + text-xs text-mc-slate-500 (cliente · responsable · fecha)
├ EstadoTimeline en caja `rounded-md border bg-white px-3 py-1.5`
├ UnderlineTabs
└ contenido de la pestaña: grid `lg:grid-cols-2` de CollapsibleSection, scroll interno
```

- Acciones del detalle: `inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium` — primaria `bg-mc-action-600 text-white hover:bg-mc-action-700`, secundaria `border hover:bg-mc-neutral-50`, destructiva `bg-red-600 text-white`.
- Modales: `Dialog` compartido (o `FormModal`). Nada de `fixed inset-0 bg-black/40` a mano.
- Confirmaciones: `Dialog` (deuda: `confirm()` nativo aún presente; no añadir más).

## 5. Formularios

- Input/select/textarea: `INPUT_CLS` (`rounded-md border px-3 py-2 text-sm`, foco `ring-mc-action-ring`). Compacto: `INPUT_SM_CLS`.
- Label: `LABEL_CLS` (`mb-1 block text-sm font-medium`). Con `Field` ya viene puesto.
- Estructura: `FormModal` → `FormSection cols={2|3}` → `Field label required hint error span`.
- Radios: `rounded-md` en controles y botones; `rounded-lg` en tarjetas/secciones; `rounded-full` en chips y badges. `rounded-xl` no se usa.

## 6. Color

- Acción: `mc-action-*` (ver §1). Foco: `ring-mc-action-ring`.
- Estados: `green / amber / red / blue` (o `mc-success / mc-warning / mc-error / mc-info`). No `rose`, `indigo`, `purple`, `fuchsia`, `sky`, `orange` para estados.
- Texto: `text-foreground` / `text-mc-slate-700` (cuerpo), `text-mc-slate-500` (secundario), `text-mc-slate-400` (metadatos).
- Marca (oro `mc-primary`, plata): solo logo y banner MycoLegalTech. Nunca en botones, enlaces ni chips.
- Sin hex literales en clases (`bg-[#…]`).

## 7. Texto

- Toda cadena visible pasa por `t()` con claves en cast/cat/eus/gal. Sin literales en el sidebar, badges, avisos ni modales.
- Cabeceras de sección: `SECTION_TITLE_CLS` (`text-sm font-semibold`). Etiquetas de grupo: `EYEBROW_CLS`.

## 8. Guardarraíles (F4 del plan)

Un chequeo en CI/deploy debe fallar ante: `bg-cyan-600` / `bg-mc-primary-600` / `bg-mc-slate-700` en botones a mano; `<h1` en una página que monta `PageTitle`; `className="p-6"` en `app/`; `<main` fuera del shell; `toLocaleDateString()` sin argumentos; hex literales en clases; literales con acento fuera de `t()`.
