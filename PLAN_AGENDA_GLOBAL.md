# PLAN — Agenda disponible en Pólizas, LegiFirma y Archivo

**Estado:** 🟡 EN CURSO — Paso 1 de 4 hecho (lectura por canal inter). Faltan 2, 3 y 4.
**Origen:** incidencia **#678** de Javier Micó — *"La agenda no debería ser visible siempre. No solo la usa Notaría, Pólizas, Legifirma… otros"*.
**Interpretación acordada:** añadir la agenda **completa** (no solo lectura) a Pólizas, LegiFirma y Archivo.
**Repos implicados:** `mycolegal-notaria`, `mycolegal-shared` (ui), `mycolegal-polizas`, `mycolegal-legifirma`, `mycolegal-archivo`
**Fecha:** 2026-09-01

---

## LO QUE YA ESTABA MONTADO (antes de este plan)

No se parte de cero. Desde **#281 Fase 3** las otras apps ya **escriben** en la agenda de la organización:

- `POST /api/inter/agenda/citas` (notaría) — publica/actualiza una cita. Idempotente por `(orgId, appSlug, refExterna)`.
- `DELETE /api/inter/agenda/citas?appSlug=&refExterna=` — la retira.
- Ya lo usan **LegiFirma** (`src/lib/inter/notaria.ts`), **Pólizas** y **Tramitación**.
- `AgendaEvento` tiene `origen`, `appSlug`, `refExterna` y `url` precisamente para esto.

**Los datos ya están todos en la agenda.** Lo que faltaba es poder verla y gestionarla desde esas apps.

---

## DECISIÓN DE ARQUITECTURA (y por qué)

> **Notaría sigue siendo la dueña de la agenda. Las demás apps montan la misma
> interfaz y hablan con notaría por el canal `inter`.**

No se replican los modelos en cada app. Dos razones, ambas comprobadas:

1. **La agenda no son solo citas.** `cargarAgenda` compone CUATRO fuentes: firmas
   previstas de `Expediente`, `Protocolo` firmados, `AgendaEvento` y
   `AgendaBloqueo`. `Expediente` **no existe** en pólizas, legifirma ni archivo;
   `Protocolo` existe en pólizas y archivo pero **no** en legifirma. Copiar los
   modelos dejaría a esas apps sin poder pintar la mitad de la agenda.
2. **Cuatro copias de la lógica derivarían.** Solapes, duraciones por tipo,
   colores, privacidad de citas ajenas y el ámbito de datos son reglas que ya
   viven en un sitio y deben seguir en uno.

### Dos cosas que se creyeron obstáculo y NO lo son

- ~~"El usuario de Pólizas puede no ser empleado de notaría"~~ — **falso**. Las
  cuatro apps comparten **una sola tabla `user_roles`**, con clave
  `(authUserId, orgId)` y el mismo enum `AppRole`. La ficha del empleado es la
  misma, así que el ámbito de datos y el enmascarado de privadas funcionan
  igual desde cualquiera de las cuatro.
- ~~"Enseñaríamos datos de notaría a una org que no la tiene contratada"~~ —
  **falso**. La agenda es **de la organización**. Si la org no tiene notaría, no
  tiene expedientes: esos carriles vienen vacíos. Siempre son sus propios datos.

### El obstáculo que SÍ es real

**La audiencia del token.** Notaría exige `exigirAudiencia(payload, SOLO_INTERNA, 'notaria')`,
así que un JWT emitido para Pólizas **es rechazado** por las rutas normales de
notaría. Por eso todo va por el canal `inter` (service-key + `X-Org-Id` +
`X-User-Id`) y no reenviando el token del usuario.

---

## PASO 1 — Lectura por el canal inter ✅ HECHO

`GET /api/inter/agenda?from=ISO&to=ISO[&asignadoId=]` en **notaría**
(`src/app/api/inter/agenda/route.ts`).

- Devuelve la agenda **ya compuesta** (las cuatro fuentes) reutilizando
  `cargarAgenda`, la misma función que alimenta la pantalla. No puede divergir.
- **`X-User-Id` es obligatorio** aquí, al contrario que en las llamadas de
  servicio: sin saber quién mira no se puede decidir qué citas privadas son
  suyas. Sin él devolvería de más o de menos.
- Resuelve la ficha por `authUserId_orgId` y exige **empleado activo** (403 si no).
- Pasa `authRole: 'user'` a propósito: `cargarAgenda` pide la agenda compartida
  (`mine: false`) y en ese caso `dataScopeWhere` devuelve `null` sin mirar el rol
  de auth. Inventar una cabecera habría hecho creer que decide algo.

---

## PASO 2 — Resto del canal inter ⬜ PENDIENTE

Mecánico pero largo. Replicar por `inter` la superficie que hoy solo existe como
rutas de sesión en notaría (`src/app/api/agenda/*`):

| Ruta actual (notaría) | Qué hace |
|---|---|
| `POST/PATCH/DELETE /api/agenda/eventos[/id]` | alta, edición y borrado de citas manuales |
| `POST/DELETE /api/agenda/bloqueos[/id]` | bloqueos de disponibilidad |
| `GET/PUT /api/agenda/horario` | horario de firma (huecos) |
| `GET/PUT /api/agenda/colores` | paleta por tipo de cita (**#670**) |
| `GET /api/agenda/conflictos` | solapes a nivel notario |
| `GET /api/agenda/print` | PDF del día/semana (**#679**: recibe `tz` del navegador) |
| `GET /api/agenda/ics-token`, `/ics/[token]` | suscripción de calendario |

**Cuidado con la privacidad y la autoría.** Toda mutación tiene que llevar el
`X-User-Id` y resolver el `userRoleId` igual que el paso 1: `creadoPorId` y la
regla de "una cita privada solo la edita su creador" dependen de ello. Un
endpoint inter que actúe "como servicio" rompería las dos.

**Sugerencia:** extraer un helper compartido en notaría que, dado el
`InterAuthOk`, devuelva el mismo objeto `auth` que usan las rutas de sesión.
Así las rutas inter delegan en la misma lógica y no se duplica nada.

---

## PASO 3 — Extraer la página a `@mycolegal-app/ui` ⬜ PENDIENTE

Es el grueso. `mycolegal-notaria/src/app/(dashboard)/agenda/page.tsx` son ~1.600
líneas e incluye:

- El calendario (FullCalendar: mes/semana/día/lista, `navLinks`, selección).
- El diálogo único de alta/edición con sus tres modos (firma, cita, bloqueo) y
  el cambio de modo de **#662**.
- La leyenda y el diálogo de colores (**#670**).
- El horario de firma y su diálogo.
- Impresión (**#679**), el toggle "solo mías", el selector de fecha (**#662**).
- Alta de expediente desde una cita (**#672**).

**Parametrizar por ruta base.** El componente no puede asumir `/api/agenda/...`:
cada app lo montará bajo su propio proxy. Pasar un `apiBase` (como ya hace
`ActPicker` con `apiBase`).

**Ojo con lo que NO es portable:** el modo "firma" busca expedientes y el enlace
"crear expediente desde esta cita" (#672) llevan a pantallas que **solo existen
en notaría**. En las otras apps esas piezas deben ocultarse, no fallar. Conviene
una prop tipo `capacidades: { expedientes: boolean }`.

---

## PASO 4 — Montar en las tres apps ⬜ PENDIENTE

Por cada una de `polizas`, `legifirma`, `archivo`:

1. Página `/(dashboard)/agenda` que monta el componente compartido.
2. Proxy `/api/agenda/[[...path]]` → canal inter de notaría, añadiendo
   `X-Service-Key`, `X-Org-Id` y `X-User-Id` desde la sesión de la app.
3. Entrada en el menú lateral.
4. **NO** añadir `AgendaEvento`/`AgendaBloqueo` a su `schema.prisma`: no leen la
   agenda de su base, la piden a notaría.

Requiere `NOTARIA_INTER_URL` e `INTER_SERVICE_KEY` en las tres, que **ya están
configuradas** (las usan para publicar citas).

---

## ORDEN Y RIESGOS

- Los pasos 2 y 3 son independientes: se pueden hacer en paralelo.
- El paso 4 no puede empezar hasta que 2 y 3 estén.
- **Release del paquete compartido**: el paso 3 obliga a publicar
  `@mycolegal-app/ui` y bumpear en las cuatro apps. Ver `PLAN_TECNICO_UI_DIST.md`
  para las cautelas de publicación.
- **Validar con una sola app primero** (sugerencia: Pólizas) antes de replicar en
  las otras dos.
- La incidencia **#678 no debe cerrarse** hasta que las tres tengan la agenda.

---

## LO QUE NO ENTRA EN ESTE PLAN

- Que otras apps creen citas automáticas: ya funciona desde #281.
- Cambiar el modelo de la agenda. No hace falta tocarlo.
- Consultor y las demás apps de la suite: #678 nombra Pólizas, LegiFirma y
  "otros". Si se quiere en más, el paso 4 se repite sin cambiar nada de 1-3.
