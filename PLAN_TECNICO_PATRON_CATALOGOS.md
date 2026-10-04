# PLAN TÉCNICO — Patrón común de catálogos: publicación, override y Tienda

> Estado: **propuesta, sin implementar** · Fecha: 1-oct-2026 · Repo dueño: `mycolegal-shared`
>
> Pieza compartida para un patrón que la flota ha reimplementado **cuatro veces** de formas distintas:
> un **catálogo global**, el **override por organización**, una **Tienda** donde cualquiera puede ofrecer lo
> suyo, y el **import/export** del catálogo por Superadmin. Consumidores previstos: Consultor (árboles de
> diagnóstico), DocFilling (esquemas y párrafos — ver `mycolegal-docfilling/PLAN_TECNICO_DOCFILLING_CORE.md`
> §F10), requisitos documentales (golden, parcialmente) y los catálogos de Datos globales.
>
> Cuando llegue al 100% → mover a `completed/`.

---

## 0. Relación con `platform/PLAN_TECNICO_CATALOGOS_GLOBALES.md`

**No es el mismo plan y no se pisan**, pero hablan de la misma enfermedad y conviene leerlos juntos.

| | `platform/PLAN_TECNICO_CATALOGOS_GLOBALES.md` | este plan |
|---|---|---|
| Qué resuelve | **Los datos**: deduplicar catálogos que hoy se copian por organización, y el motor único de requisitos | **El mecanismo**: publicar, aprobar, elevar a global, hacer override, avisar, importar y exportar |
| Estado | Vivo, sólo le queda el paso 6 | Propuesta |
| Caso | `legal_acts` per-org | árboles, esquemas y párrafos de DocFilling, requisitos, datos globales |

Y este es el dato que une los dos, medido en PROD el 26-sep por ese plan: `legal_acts` per-org tiene **37.418 filas
en 91 organizaciones** con **413 códigos distintos** — es decir, **91 copias del mismo catálogo**, de las que sólo
**18 filas** son específicas de alguna notaría (dos códigos legacy). Exactamente la misma forma que acabamos de medir
en los árboles: 372 nodos de contenido convertidos en 36.101 filas.

**Tercer caso de la misma avería, entonces, y la misma cura**: dejar de copiar y resolver en lectura
(`efectivo(org, clave)`, §3). Lo que aporta este plan al paso 6 de aquél es la primitiva de resolución y de override
que necesita; lo que aporta aquél a este es la prueba de que el problema no es de un catálogo, es de la casa.

## 1. Por qué existe: lo que mide producción

El modelo actual de la Tienda de Árboles **funciona** —es fiable— pero distribuye **copias físicas** a todas las
organizaciones. Medido en PROD el 1-oct-2026:

| | |
|---|---|
| Árboles activos | **1.288** · maestros publicados **13** · propios no-copia 37 |
| Copias vinculadas | **1.238** · con vínculo roto **0** · desactualizadas **0** |
| Nodos | **37.121** → **372 en los maestros**, **36.101 en copias** |
| Preguntas | 37.798 |
| Orgs con árboles | 97 de 106 · `canEditTrees` 7 · `canPublishTrees` 4 · `isSeedTemplate` 1 |
| Recorridos | 544, de ellos **367 sobre copias** |

Dos lecturas, las dos importantes:

1. **372 nodos de contenido real se han convertido en 36.101 filas** (factor ~97×), porque `distributeTree`
   materializa el árbol entero en cada org.
2. **Nadie ha hecho override nunca** (0 `linkBroken`): las 1.238 copias son hoy idénticas a sus 13 maestros. La
   duplicación no está comprando nada.

La propagación, en cambio, es sólida: cero copias obsoletas y los recorridos funcionan sobre las copias. Lo que hay que
cambiar no es el mecanismo de vínculo —es bueno— sino **cuándo se crea la copia**.

---

## 2. Decisiones (1-oct-2026)

| # | Decisión |
|---|---|
| **C1** | **La copia deja de ser el mecanismo de distribución y pasa a ser el mecanismo de override.** El catálogo global se resuelve **en lectura**; sólo aparece una copia cuando una organización decide ajustar algo. Se pasa de *push* a *pull*. `distributeTree` desaparece. |
| **C2** | **El vínculo se conserva** en la copia (de qué maestro y qué versión viene), para avisar de versiones nuevas y permitir auto-update. Editar la copia rompe el vínculo, como hoy. |
| **C3** | **Publicar lo puede solicitar cualquier organización** — cae el doble candado actual (`canPublishTrees`). Pero **no se ve en la Tienda global hasta que un Superadmin lo aprueba**. |
| **C4** | Esa aprobación se gestiona en una sección nueva de Admin: **«Publicaciones de clientes»**, bandeja de solicitudes con aprobar / rechazar / elevar al catálogo global. |
| **C5** | **Se recogen las copias existentes** de árboles (1.238), con migración cuidadosa del histórico de recorridos (§6, F4.2). No se dejan morir de viejas. |
| **C6** | **El Superadmin puede exportar e importar cualquier catálogo global desde y hacia ficheros**, con un sobre común (§5). |
| **C7** | **Excepción de los requisitos documentales**: ahí el maestro sigue siendo **git** (el golden en `consultor/content/req-docs`), y la BD es derivada. Export sí; la escritura del maestro va por el circuito de propuestas al golden, no por la UI. El resto del patrón (overrides, avisos, Tienda) aplica igual. |
| **C8** | **La unidad de venta, donde haya venta, es el elemento principal del catálogo** (en DocFilling, el esquema), nunca sus piezas de montaje (los párrafos). El patrón expone un gancho de **derecho de uso** por elemento; quién cobra y por qué es del catálogo consumidor, no de esta pieza. |

---

## 3. Modelo de estados

Un elemento de catálogo está en uno de estos estados, y el patrón es el dueño de las transiciones:

```
                        ┌──────────── PROPIO ────────────┐
                        │ orgId = la org · sin vínculo    │
                        └───────┬───────────────┬─────────┘
                    solicitar publicación       │ (nunca sale de la org)
                                │
                     ┌──────────▼──────────┐   rechazo    ┌─────────────────┐
                     │ PUBLICACIÓN PEDIDA  │─────────────►│ PROPIO (con     │
                     │ visible sólo p/ el  │              │ motivo y reintento)│
                     │ autor y el Superadm.│              └─────────────────┘
                     └──────────┬──────────┘
                      aprobación de Superadmin
                                │
                     ┌──────────▼──────────┐   elevar     ┌─────────────────────┐
                     │ EN LA TIENDA        │─────────────►│ CATÁLOGO GLOBAL      │
                     │ maestro de una org  │  (Superadm.) │ orgId = NULL         │
                     │ versión + autoría   │              │ lo resuelven todas   │
                     └──────────┬──────────┘              └──────────┬──────────┘
                                │                                     │
                   otra org lo ajusta  ◄───── resolución en lectura ──┘
                                │
                     ┌──────────▼───────────────────────────┐
                     │ COPIA VINCULADA (= el override)       │
                     │ sourceId · sourceVersion · autoUpdate │
                     │ editar ⇒ linkBroken (pasa a PROPIO)   │
                     └──────────────────────────────────────┘
```

Reglas que el patrón garantiza, iguales para todos los catálogos:

- **Navegar y usar el catálogo global y la Tienda no requiere autorización**: es consumo, disponible desde el día 1.
- **Resolución efectiva**: `efectivo(org, clave)` = elemento de la org si existe, si no el global. Nada se copia por
  adelantado.
- **Republicar** sube `publishVersion`: auto-update de las copias con vínculo intacto, aviso in-app a las demás.
- **Retirar** de la Tienda no afecta a las copias ya hechas; dejan de recibir versiones.
- **Romper el vínculo** es irreversible y convierte la copia en contenido propio, que puede volver a publicarse.
- **Autoría** (org + nombre) viaja con cada copia y no se pierde al elevar al catálogo global.
- **Derecho de uso**: antes de resolver, el patrón pregunta al consumidor si la org tiene derecho a ese elemento. Es un
  gancho, no una política. **Se comprueba en la resolución, no en la UI.**

---

## 4. El adaptador por catálogo

Lo que no se puede compartir es la **forma del contenido**: nodos y preguntas, filas de requisitos, ficheros `.docx` y
`.md`. Así que cada catálogo implementa un adaptador pequeño y el patrón hace el resto:

```ts
interface CatalogAdapter<TSnapshot> {
  kind: string;                                         // 'arbol' | 'docfilling_esquema' | …
  snapshot(itemId: string): Promise<TSnapshot>;         // → forma portable, autocontenida
  apply(target: {orgId: string|null, itemId?: string}, s: TSnapshot): Promise<string>;
  fingerprint(s: TSnapshot): string;                    // sha256 estable, para saber si cambió
  key(s: TSnapshot): string;                            // clave estable entre entornos
  validate?(s: TSnapshot): Promise<Diagnostic[]>;       // bloquea publicar si hay errores
}
```

Y la mayor parte ya está escrita:

| Catálogo | `snapshot` / `apply` | `fingerprint` | Falta |
|---|---|---|---|
| Árboles (Consultor) | `toPortableTree` / `materializeNodes` + `clearTreeNodes` | — | huella y clave estables |
| DocFilling (esquemas y párrafos) | fichero en la Unidad de Red | `sha256` ya previsto | el adaptador |
| Requisitos (golden) | golden en `content/req-docs` + filas derivadas | huellas en `docfilling/huellas/` | sólo lectura (C7) |
| Datos globales (notarios, registradores, bancos) | upsert por clave normalizada | — | import/export unificado |

---

## 5. Datos e import/export

### 5.1 Reparto de tablas (decisión de diseño)

- **Las publicaciones y su aprobación van a tablas genéricas nuevas**, porque son funcionalidad nueva y
  transversal: `catalog_publicaciones` (`kind`, `itemId`, `orgId`, `estado` ∈ `pedida|aprobada|rechazada|retirada`,
  `proposito`, `publishVersion`, `authorOrgId`, `authorName`, `revisadoPorId`, `motivoRechazo`, tiempos) y
  `catalog_elevaciones` (traza de qué se promovió al catálogo global, por quién y desde qué publicación).
- **El vínculo se queda en la tabla de cada catálogo** (`sourceId`, `sourceVersion`, `autoUpdate`, `linkBroken`), como
  ya lo tienen los árboles: es una referencia a una fila del propio catálogo y una tabla genérica perdería la
  integridad referencial. El patrón lee y escribe esas cuatro columnas por el adaptador.
- Canónico en `mycolegal-platform/prisma/schema.prisma` con migración allí (una migración en el repo de una app no se
  aplica nunca en test ni prod).

### 5.2 El sobre de import/export

```jsonc
{ "catalogo": "arbol", "version_sobre": 1, "entorno_origen": "prod", "exportado": "2026-10-01T…",
  "elementos": [ { "key": "…", "publishVersion": 3, "autoria": {…}, "huella": "sha256:…", "contenido": { … } } ] }
```

Dos exigencias que gobiernan el diseño:

1. **El sobre lleva `key` estable y `publishVersion`**, y la importación es **upsert por `key`**, nunca insert. Un sobre
   anónimo crearía maestros nuevos y **rompería todos los vínculos** de las copias existentes: cada organización
   perdería el aviso de actualización y su override quedaría huérfano.
2. **Hay que decir qué pasa con lo ausente**: `merge` por defecto (lo que no viene, se deja) y `--mirror` explícito
   (lo que no viene, se retira). **Dry-run por defecto** y `--apply` para escribir. Es exactamente lo que ya hace
   `mycolegal-platform/scripts/deploy-ai-config.sh` para `ai_task_models`, y se copia su criterio.

---

## 6. Fases y tareas

### F0 — Inventario y contrato (2 j)

- [ ] **F0.1** Inventario de los cuatro mecanismos actuales y de qué se queda cada uno: Tienda de árboles (copias),
      corpus `_system`/`GLOBAL:BIBLIOTECA` (una copia, escrita por ingesta), filas global+override de requisitos
      documentales (`origen: 'GLOBAL' | 'LOCAL'`, con `oculto` y mezcla campo a campo), y clonado al crear la org
      (`Organization.isSeedTemplate`). El cuarto **no se sustituye**: sembrar una org nueva seguirá siendo un clonado.
- [ ] **F0.2** Cerrar el contrato `CatalogAdapter` (§4) contra los cuatro consumidores, en papel, antes de escribir
      código.
- [ ] **F0.3** Decidir si el gancho de derecho de uso es sincrónico (`can(orgId, kind, key)`) o un filtro de lista.
      Recomendación: los dos, porque la resolución de un INCLUDE necesita el puntual y la Tienda necesita el de lista.

### F1 — La pieza compartida (5–6 j)

- [ ] **F1.1** Paquete o subpath en `sharedlib`: `catalogos/` con los estados de §3, las transiciones y sus guardas.
- [ ] **F1.2** `efectivo(org, clave)` y `listarEfectivo(org)` genéricos sobre el adaptador, con caché por
      `(orgId, kind, huella)` e **invariante de aislamiento**: una resolución nunca devuelve contenido de otra org.
- [ ] **F1.3** Publicación: `solicitarPublicacion`, `aprobar`, `rechazar`, `retirar`, `republicar` (bump de versión),
      `elevarAGlobal`. Escriben `catalog_publicaciones` / `catalog_elevaciones`.
- [ ] **F1.4** Vínculo: `adoptar` (crea la copia = override), `aplicarVersion`, `romperVinculo`, `volverAlCatalogo`
      (descarta el override).
- [ ] **F1.5** Avisos: reusar `notifyInApp` con un tipo por catálogo (`<kind>_update_available`), y el aviso al autor
      cuando su publicación se aprueba o se rechaza.
- [ ] **F1.6** Validación previa a publicar vía `validate()` del adaptador: **no es revisión editorial, es no romper**
      (sintaxis correcta, referencias resueltas).
- [ ] **F1.7** Tests de la máquina de estados con un adaptador de juguete, incluidas las transiciones prohibidas.

### F2 — Admin: «Publicaciones de clientes» (3–4 j)

- [ ] **F2.1** Bandeja en Admin con las solicitudes de todos los catálogos: quién, qué, propósito, diagnóstico de
      `validate()`, previsualización del contenido y acciones **aprobar / rechazar con motivo**.
- [ ] **F2.2** Acción **«Elevar al catálogo global»** desde una publicación aprobada, con confirmación: deja de ser de
      una org y pasa a `orgId = NULL`, conservando autoría.
- [ ] **F2.3** Historial de lo aprobado, rechazado, elevado y retirado, con quién y cuándo.
- [ ] **F2.4** Retirar de Admin los interruptores que el modelo nuevo deja sin sentido (`canPublishTrees`), conservando
      `canEditTrees` mientras el «modo consulta» de #484 siga siendo una prestación.
- [ ] **F2.5** Avisos a Superadmins cuando entra una solicitud (el canal de Avisos ya existe).

### F3 — Import/export de cualquier catálogo (4 j)

- [ ] **F3.1** Serializador y deserializador del sobre de §5.2, con validación de `version_sobre`.
- [ ] **F3.2** `exportarCatalogo(kind, {soloGlobal|conTienda})` y `importarCatalogo(sobre, {merge|mirror, dryRun})`,
      upsert por `key`, informe de qué se crea, actualiza, retira y omite.
- [ ] **F3.3** Pantalla en Admin › Datos globales: exportar a fichero, importar con **dry-run obligatorio primero** y
      diff legible antes de aplicar.
- [ ] **F3.4** Promoción **entre entornos** reusando el mismo sobre (local → test → prod), con el criterio de
      `deploy-ai-config.sh`: backup obligatorio si el destino es prod y confirmación explícita.
- [ ] **F3.5** Comprobación de integridad post-import: ninguna copia queda con `sourceId` apuntando a un maestro que ya
      no existe. Si alguna lo hace, el import se rechaza antes de escribir.

### F4 — Consultor, primer consumidor: recogida de las copias (5–7 j)

La parte delicada del plan. Aquí no se añade una funcionalidad: se desmonta una que está viva y en uso.

- [ ] **F4.1** Adaptador de árboles sobre `toPortableTree` / `materializeNodes`, más `key` estable y `fingerprint`.
- [ ] **F4.2** **Migración de recogida.** Las 1.238 copias con vínculo intacto se sustituyen por resolución en lectura.
      El riesgo concreto son los **367 recorridos que apuntan a ids de copias** (y es la razón por la que hoy
      `applyMasterToCopy` conserva el id del árbol). Dos caminos, a decidir con los datos delante:
      **(a)** conservar la fila de la copia como **puntero sin nodos** (`sourceId` + `linkBroken=false`, cero nodos) y
      que la resolución la siga por el vínculo — el histórico no se toca;
      **(b)** remapear `myconsultor_tree_recorridos.treeId` al maestro y borrar la copia.
      Recomendación: **(a)**, porque no reescribe histórico y es reversible. Y en los dos casos: inventario previo
      distinguiendo copia de verdad de árbol propio homónimo, porque la deduplicación actual compara **por título**.
- [ ] **F4.3** Retirar `distributeTree` y su botón, y la ruta que lo invoca.
- [ ] **F4.4** Abrir el publicar a cualquier org como **solicitud** (C3), con la bandeja de F2 como destino.
- [ ] **F4.5** Los 13 maestros publicados: decidir uno a uno si se **elevan al catálogo global** (lo esperable, son los
      de Micó) o se quedan como maestros de la Tienda.
- [ ] **F4.6** UI de Consultor: las tarjetas pasan a enseñar «Del catálogo» / «Ajustado» / «Propio» / «En la Tienda» /
      «Publicación pedida», con *Ajustar* y *Volver al catálogo*.
- [ ] **F4.7** Verificar en PROD con `runsql` que el recuento de nodos cae de 37.121 a ~1.000 y que los 544 recorridos
      siguen resolviendo. **Antes**, backup de Cloud SQL.

### F5 — DocFilling, segundo consumidor (ver su propio plan)

- [ ] **F5.1** Adaptador de esquemas y párrafos (fichero + `sha256` + `esquemaCampos`). El detalle, los packs y el
      derecho de uso están en `mycolegal-docfilling/PLAN_TECNICO_DOCFILLING_CORE.md` §F10, que es quien consume esto.
- [ ] **F5.2** Comprobar que el gancho de derecho de uso de F0.3 cubre el caso duro: un `INCLUDE` no puede resolver un
      elemento al que la org no tiene derecho.

### F6 — Requisitos y Datos globales (3 j)

- [ ] **F6.1** Requisitos: adaptador de **sólo lectura** para export (C7), y los overrides por org pasan a usar las
      transiciones del patrón sin cambiar su forma de datos (`origen GLOBAL|LOCAL` ya es la resolución en lectura: es,
      de los cuatro mecanismos, el que ya estaba bien).
- [ ] **F6.2** Datos globales (notarios, registradores, bancos): entran sólo por import/export (F3), que sustituye a
      la carga de Excel ad-hoc y a los `.xlsx` bundleados en `reference-data/`.
- [ ] **F6.3** `ai_task_models` se queda con `deploy-ai-config.sh`: ya tiene su promoción entre entornos y no gana nada
      migrando. Anotarlo para que nadie lo intente.

---

## 7. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **R1** | La recogida de las 1.238 copias rompe el histórico de 367 recorridos. | Alto | F4.2 opción (a), reversible, con backup y verificación por `runsql` antes y después. |
| **R2** | Un import con sobre mal formado **rompe los vínculos** de todas las copias. | Alto | Upsert por `key` (§5.2), dry-run obligatorio y comprobación de integridad F3.5 que rechaza antes de escribir. |
| **R3** | El gancho de derecho de uso se comprueba en la UI y no en la resolución → fuga de contenido de pago. | Alto | F1.2: el invariante vive en `efectivo()`, con tests; y casos de corpus en el consumidor (DocFilling §F10.6). |
| **R4** | Abrir la publicación a todas las orgs llena la bandeja de ruido. | Medio | `validate()` bloquea lo que no compila, propósito obligatorio, y la Tienda no muestra nada sin aprobación. |
| **R5** | Cuatro catálogos con un adaptador insuficiente → se filtran particularidades al patrón y deja de ser común. | Medio | F0.2 cierra el contrato contra los cuatro **antes** de codificar; si uno no encaja, se queda fuera (como `isSeedTemplate`). |
| **R6** | Tocar `sharedlib` obliga a publicar y a bumpear consumidoras. | Bajo | `publish-package.sh` ya lo hace; Cloud Build usa el lockfile, así que quien necesite la versión nueva debe pinnearla. |

## 8. Orden

```
F0 ─► F1 ─┬─► F2 ─► F4 (Consultor: recogida)
          ├─► F3 ─► F6 (requisitos + datos globales)
          └─► F5 (DocFilling, en paralelo a F4)
```

F4 es el único que toca datos vivos: va después de que F1 y F2 estén probados, y con backup. F5 no depende de F4.
Esfuerzo total ≈ **22–26 jornadas**.

## 9. Fuera de alcance

- Sustituir el clonado por `isSeedTemplate` al crear una organización (F0.1): seguirá siendo un clonado.
- Hacer autoritativa la UI del catálogo global de **requisitos** (C7): el maestro sigue siendo git.
- La política comercial de los catálogos (quién cobra qué): esta pieza expone el gancho, no la decide.
