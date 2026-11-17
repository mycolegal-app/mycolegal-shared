# PLAN TÉCNICO — Plantillas de documento con el motor DocFilling en Legifirma y Pólizas

> Estado: **propuesta, sin implementar** · Fecha: 16-nov-2026 (rev. 2, mismo día) · Repo dueño: `mycolegal-shared`
> (`sharedlib` + `ui`); consumidoras: `mycolegal-legifirma` y `mycolegal-polizas`; toca también `mycolegal-platform`
> (esquema compartido) y `mycolegal-redactor` (piezas que se suben a shared).
>
> Hoy las plantillas de documento de estas dos apps sólo sustituyen `{{clave}}`, sin condiciones ni formatos, y salen
> en PDF desde un HTML. Este plan las pasa a **sintaxis DocFilling compuesta con `docfilling-core`** y **sólo produce
> `.docx`, fusionado con el Word de la notaría** (membrete, logo, fuentes, cabecera y pie), como Redactor. Les da además
> un **editor común** que la notaría usa desde cada app, sobre la tabla `document_templates` que ya comparten.
>
> Cuando llegue al 100 % → mover a `completed/`.

---

## 1. Por qué

### 1.1 Lo que hay

| | Legifirma | Pólizas |
|---|---|---|
| Plantillas | `RECIBO_PROVISION`, `OFICIO_TRASLADO` | `INTERVENCION_POLIZA` (castellano y catalán, #653) |
| Catálogo | `legifirma/src/lib/printers/document-catalog.ts` | `polizas/src/lib/printers/document-catalog.ts` |
| Formato guardado | HTML a pelo (`bodyFormat = HTML`) | Markdown (`bodyFormat = MARKDOWN`, #622) |
| Editor | `DocumentTemplatesManager` de `ui` (TipTap + modo HTML), en *Admin → Plantillas → Documentos* | `MarkdownEditor` de `ui` (TipTap ↔ markdown), en *Mantenimientos → Intervención* |
| Datos de la notaría | claves `notaria_*` de su `Configuracion` | ídem, las suyas |
| Salida | PDF (recibo: descarga; oficio: en el navegador) + texto plano del oficio para SIGNO/SIC (#127) | PDF en el navegador + `.docx` desde el mismo HTML (#654) |
| Membrete | Un recuadro HTML con los datos de la organización | Una línea de pie |

**El PDF no lo usa nadie más.** Ni se envía por correo, ni se archiva, ni se firma. Las tres rutas lo devuelven al
navegador y ahí acaba (comprobado el 16-nov en `provision-recibo/route.ts`, `oficio/route.ts` y
`polizas/[id]/intervencion/route.ts`). Quitarlo no rompe ningún flujo.

### 1.2 Lo que se gana

1. **Las condiciones pasan al texto.** `buildOficioMacros` (`legifirma/src/lib/printers/oficio-traslado.ts:107`) calcula
   en código `docTrasladado`, `expedidaFirmada`, `dichoDoc` y `tipoNumeracion` sólo porque la plantilla no admite
   condiciones. Con el motor, la notaría lo ve y lo edita:
   `{{IF TIPO_DOC == 'POLIZA'}}el testimonio de la póliza{{ELSE}}la copia de la escritura{{ENDIF}}`.
2. **Formatos del motor** en lugar de valores ya formateados en el backend: `{{FECHA#date_long}}`, `{{IMPORTE#amount}}`
   y `{{X#words}}`, iguales en castellano y en catalán (`compose(…, locale)`).
3. **Listas.** Los `comparecientes` de Pólizas llegan hoy como un bloque de texto ya montado. Con `FOR EACH`
   la plantilla decide cómo se escribe cada uno (lista = JSON en el valor, convención F5.25 de Redactor).
4. **Membrete real.** El Word sale con el membrete de la notaría, y el diseño lo cambia la notaría en su propio Word,
   no nosotros en código.
5. **Validación con el motor de verdad** al guardar. Hoy una plantilla mal escrita sale mal y nadie se entera.
6. **Una sola sintaxis y unos solos datos de la notaría** en la flota, los mismos que en Redactor.

### 1.3 Comprobado el 16-nov (no es teoría)

- `compose()` resuelve un IF en línea con `ELSE`, `#amount` y `#date_long` sobre el texto real del oficio. Salida:
  «He trasladado a papel el testimonio de la póliza, número 1234. Importe: 50,00 euros.»
- **El `MarkdownEditor` actual no sirve para esta sintaxis**: el paso markdown → HTML → markdown (`marked` +
  `turndown`) devuelve `{{SOLICITANTE\_NOMBRE}}` e `{{IF TIPO\_DOC == "POLIZA"}}`, y convierte las líneas de
  `{{IF}}`/`{{ENDIF}}` en saltos forzados dentro del mismo párrafo. Rompería todas las plantillas **sin avisar**.
  Por eso este plan **no edita con TipTap**: edita texto plano.
- Un campo sin valor sale como **`[NO DISPONIBLE]`** (hoy, vacío). Ver D4.
- `validateText()` da **W056 «usado sin DECLARE explícito»** en cada campo. Aquí los campos los pone la app y nunca se
  declaran, así que ese aviso se filtra (§3.4).
- La fusión de platform (`platform/src/lib/docx/merge.ts`) **conserva tal cual** cabecera, pie, márgenes y tamaño de
  la plantilla (`<w:sectPr>`), **no rellena campos en la cabecera** y ya entiende `{{WORD_STYLE:X}}` y `{{PAGEBREAK}}`
  en el cuerpo. Sin plantilla, `/internal/docx` responde `400 missing_referencia` a propósito.
- La plantilla de respaldo de Redactor (`redactor/plantillas/PLANTILLA_REFERENCIA_NOTARIAL.docx`) es **de escritura**
  (papel timbrado, geometría de 54 caracteres por línea). **No sirve para un recibo o un oficio**, que son cartas.

---

## 2. Decisiones

| # | Decisión | Estado |
|---|---|---|
| **D1** ✅ | Alcance de la sintaxis | **Decidido (Carles, 16-nov).** Campos de la app, **campos predefinidos de la notaría** (`{{SYSTEM:NOMBRE_NOTARIO}}` y los demás, §3.6), `IF`/`ELSE`/`ENDIF`, formatos `#…`, `FOR EACH`, `{{BLOQUEO}}`, y para el Word `{{WORD_STYLE:X}}` y `{{PAGEBREAK}}`. Fuera: `DECLARE`, `:INPUT`, `:REQ`, `INCLUDE` y biblioteca. No son esquemas de Redactor: no entran en el catálogo de atributos ni en la biblioteca |
| **D2** ✅ | Presentación | **Consecuencia de D6.** Ya no hay marco HTML ni CSS en el catálogo: la presentación es la del Word de la notaría. El cuerpo sólo lleva texto y, cuando haga falta, el nombre de un estilo de su plantilla. Desaparece el uso de `cssOverride` en las plantillas DocFilling |
| **D3** ✅ | Qué puede editar la notaría | **Decidido (Carles, 16-nov): todo el texto.** También la cláusula de protección de datos: va al final del cuerpo, con `{{WORD_STYLE:Texto legal}}` para que salga con la letra pequeña que la notaría defina en su Word. El diseño (cabecera, logo, pie, márgenes) lo edita en su propio Word |
| **D4** | Campo sin valor | Por defecto: **sale vacío**, como hoy. La generación avisa (las `warnings` de `composeWithDiagnostics`) y la vista previa lo marca. En un documento que se entrega al cliente, un `[NO DISPONIBLE]` es peor que un hueco |
| **D5** | Nombres de campo | Por defecto: convención DocFilling (`numeroRecibo` → `NUMERO_RECIBO`). Se hace ahora, con tres plantillas |
| **D6** ✅ | Membrete y formato de salida | **Decidido (Carles, 16-nov): fusión con el Word de la notaría, y SÓLO `.docx`. Se elimina la generación de PDF** en estas tres plantillas. No hace falta la F2.7 de `PLAN_TECNICO_CALIDAD_MOTOR` (Word → PDF en platform). La versión en texto plano del oficio para SIGNO/SIC (#127) se mantiene |
| **D7** | Archivo y Tramitación | Por defecto: **no entran**. También usan `DocumentTemplatesManager`; el componente gana un modo nuevo y ellas siguen igual, con su PDF |
| **D9** ✅ | Cuántos Word de membrete | **Decidido (Carles, 16-nov): uno por plantilla** de Legifirma o de Pólizas (§3.3). Sin Word común por app |
| **D8** | Plantilla sin Word subido | Por defecto: **plantilla de carta genérica** (A4, márgenes normales, estilos `Texto legal` y los de encabezado definidos) que viaja con `sharedlib`. El cuerpo por defecto de cada plantilla **empieza por los datos de la notaría** con campos `SYSTEM:`, para que sin membrete el documento no salga anónimo. **Nunca** se cae a la plantilla de escritura de Redactor |

**Consecuencia que hay que asumir (D6):** el recibo de provisión se entrega en mano. Hoy se descarga un PDF y se
imprime; ahora se descarga un Word, se abre y se imprime. Es un paso más en el mostrador.

---

## 3. Diseño

### 3.1 Formato nuevo en la tabla

`BodyFormat` (`sharedlib/document-render.ts:22`) pasa de `'HTML' | 'MARKDOWN'` a **`'HTML' | 'MARKDOWN' | 'DOCFILLING'`**.
La columna `bodyFormat` ya existe (#622) y es `VarChar(10)`: **no hay migración para esto**. Las filas `HTML` y
`MARKDOWN` que ya existan se tratan en F4/F5.

El editor y la generación leen el formato **de la fila guardada**, no del catálogo, para que una plantilla antigua no
se interprete con la sintaxis nueva.

### 3.2 Generación (servidor)

```
plantilla DOCFILLING + valores (de la actuación / póliza) + predefinidos de la notaría (§3.6)
  → escapar valores de DATO (no los de condición)               ← sharedlib
  → composeWithDiagnostics(plantilla, valores, locale)          ← docfilling-core
  → markdown final + warnings
  → elegir el Word de la notaría para ese documento (§3.3)      ← sharedlib
  → platform POST /internal/docx { markdown, referencia }       ← ya existe (camino de fusión, F2.6)
  → .docx  (y avisos: estilos que la plantilla no define)
```

- **Escapado.** Lo que hoy hace `escapeHtml`, que un nombre de cliente no pueda inyectar formato ni etiquetas, pasa a
  `escapeMarkdown`, que ya existe en `sharedlib`, **sólo en los campos de dato**. Los campos que aparecen en un `IF` o
  gobiernan un `FOR EACH` van tal cual: escaparlos cambiaría la comparación (`TIPO\_DOC`). Se distinguen con
  `parseFields`/`classifyField` del motor. Test obligatorio: un nombre `**Juan**_<b>x</b>` sale literal en el Word.
- **Texto plano del oficio (#127):** mismo markdown final, sin marcas. Ya no sale de un HTML.
- **Se borra** el camino HTML → PDF y HTML → `.docx` de estas tres plantillas: `renderPdf`/`renderDocx(html)`,
  `markdownToDocumentHtml` de Pólizas y el CSS por defecto. `/internal/pdf` sigue para las demás apps.

### 3.3 El Word de la notaría

Se reutiliza lo que ya tiene Redactor:

| Pieza | Hoy en | Se hace |
|---|---|---|
| Tabla `DocfillingPlantillaEstilo` | BD compartida `mycolegal_app` (canónica en platform) | Se amplía su **ámbito** (abajo). Migración en platform |
| Fichero `.docx` | Bucket de la Unidad de Red, `redactor/plantillas/<org>/<huella>.docx` (`redactor/src/lib/plantillas/almacen.ts`) | El almacén **sube a `sharedlib`**, con el prefijo como parámetro (`legifirma/…`, `polizas/…`) |
| Validación al subir | `platform/src/lib/docx/validar-plantilla.ts` | Sin cambios; se le pasan los estilos que usan estas plantillas (`Texto legal`…) |
| Elección por escalera | `redactor/src/lib/plantillas/index.ts` | La lógica sube a `sharedlib`; Redactor la usa desde ahí |

**Ámbito nuevo: un Word por plantilla (D9).** Hoy: `ESQUEMA → ACTO → FAMILIA → TODOS → referencia del repo`, todo de
escrituras. Se añade **un solo ámbito, `DOCUMENTO`**, con `ambitoCodigo` = `<app>:<eventKey>`
(`legifirma:RECIBO_PROVISION`, `legifirma:OFICIO_TRASLADO`, `polizas:INTERVENCION_POLIZA`). Cada plantilla tiene **su**
Word, como mucho uno activo. Si no lo hay, la **carta genérica (D8)**. **No hay Word común por app** y la escalera
**no mira `TODOS`**, que es la de escritura.

En Pólizas, castellano y catalán son la misma plantilla (`eventKey`) en dos filas de `idioma`, así que **comparten el
Word**: el membrete no cambia con la lengua del texto.

**Dónde se sube.** Junto al texto de cada plantilla, en la misma pantalla (§3.5), apartado *Membrete*: subir, ver la
validación (estilos que faltan) y sustituir o quitar. No hay que elegir a qué documento se aplica: es el de la plantilla
que se está editando.

### 3.4 Validación (servidor, al guardar)

`validarPlantillaDocumento(texto, camposDelCatalogo, predefinidos)` en `sharedlib`:

- `validateText()` del motor; **bloquean** los `error`. Los `warning` se muestran sin bloquear, y **W056 se filtra** (§1.3).
- Campo que **no está en el catálogo** de esa plantilla ni es un `SYSTEM:` conocido → error propio
  («`NOTARIO_NOMBRES` no existe; ¿quisiste decir `SYSTEM:NOMBRE_NOTARIO`?»).
- Directivas fuera de D1 (`DECLARE`, `INCLUDE`, `:INPUT`…) → error.
- `{{WORD_STYLE:X}}` con un estilo que la plantilla activa de la notaría no define → aviso (no bloquea: la fusión saca
  el párrafo con el estilo por defecto).

Misma regla que el editor de párrafos de Redactor: valida el motor, no una segunda gramática escrita a mano.

### 3.5 Editor común (`ui`)

**`DocumentTemplatesManager` gana un modo `DOCFILLING`**, que se activa cuando la fila es de ese formato. Cada app lo
sigue teniendo donde lo tiene, y Pólizas deja su `MarkdownEditor` para la diligencia.

- **Texto plano con CodeMirror** y el resaltado DocFilling. Se **sube a `ui`** lo que hay en Redactor
  (`src/components/codigo/docfilling-lang.ts`, `docfilling-theme.ts`) y **Redactor pasa a importarlo de `ui`**.
- **Carga diferida** (`dynamic import`) de CodeMirror: sólo pesa en el modo DocFilling.
- **Paleta con dos grupos:** *Datos del documento* (los `macros` del catálogo, con su ejemplo) y *Datos de la notaría*
  (los predefinidos, con su valor actual; si falta uno, se marca y se dice dónde configurarlo). Al pulsar uno se
  inserta; hay botones para insertar una condición y un estilo.
- **Diagnósticos en línea** al pulsar *Comprobar* y al guardar, con el arreglo (`fix`) que propone el motor.
- **Vista previa:** en la propia pantalla, el texto compuesto con los ejemplos (markdown → HTML, sólo para leer; los
  campos vacíos marcados), y un botón **«Descargar Word de prueba»** que hace la fusión real con el Word de la
  notaría. Sustituye al PDF de vista previa de hoy.
- **Apartado Membrete** (§3.3).
- **Restaurar el texto por defecto** (ya está).

Lo que **no** se hace: validación mientras se escribe, IA o esconder la sintaxis. Eso es el editor avanzado de Doku (F6
del plan de UI de Redactor); si llega, sustituye a este modo sin tocar el resto.

### 3.6 Campos predefinidos de la notaría (D1)

Los **mismos que Redactor**, con la misma sintaxis: `{{SYSTEM:NOMBRE_NOTARIO}}`, `POBLACION_NOTARIO`,
`COLEGIO_NOTARIAL`, `DIRECCION_NOTARIA`, `MUNICIPIO_NOTARIA`, `COMUNIDAD_AUTONOMA`. El motor ya entiende `SYSTEM:`.
El objetivo: que la notaría escriba sus datos una vez y le sirvan en las tres apps.

- **Una sola fuente.** Hoy los calcula `redactor/src/lib/generacion/predefinidos.ts` (`predefinidosDeOrg`): tabla
  `docfilling_campo_predefinido` (BD compartida), identidad de la organización en auth y notarios de `user_roles`.
  **Sube a `sharedlib`** con un puerto para Prisma (como `requisitos-core`) y **Redactor la usa desde ahí**. Si no,
  dos derivaciones de la dirección acabarían diciendo cosas distintas (#1074, 13-nov).
- **Nuevos:** `TELEFONO_NOTARIA`, `EMAIL_NOTARIA`, `WEB_NOTARIA`, derivados de la identidad. Los usa el recibo y
  quedan para Redactor.
- **Sustituyen** a las macros de la notaría de los catálogos (`notariaNombre`, `notariaDireccion`, `notarioColegio`…)
  y, con ellas, a las claves `notaria_*` de la `Configuracion` de cada app. **Al pasar a cada app** (F4/F5): si un
  predefinido está vacío y la app tiene su `notaria_*` relleno, se copia una vez al predefinido. Luego la clave de la
  app deja de leerse.
- **Notario que firma.** Si la actuación o la póliza ya dicen qué notario es (oficio, diligencia), **ese gana**: quién
  firma es propiedad del documento, no de la organización. El predefinido sólo se usa si el documento no lo dice.

### 3.7 Dependencias

- `sharedlib` depende de `docfilling-core` **sólo desde un subpath nuevo** (`@mycolegal-app/sharedlib/document-docfilling`),
  con `docfilling-core` como `peerDependency`. Las apps que no lo usan no lo cargan.
- Las dos consumidoras declaran `docfilling-core`, lo añaden a `transpilePackages` (hoy sólo Redactor) y su espejo de
  Prisma gana `DocfillingPlantillaEstilo` y `DocfillingCampoPredefinido`.
- Cableado de flota: `apps.json` `usesDocfillingCore` en las dos apps, y los sitios de la memoria *«paquete shared
  nuevo»*. El paquete ya existe; lo nuevo es que tenga **más consumidoras** (`CONSUMER_APPS`, lockfile de cada app).
- Configuración del bucket de plantillas (`PLANTILLAS_BUCKET` y GCS) en Legifirma y Pólizas, en los tres entornos, con
  su IAM (memoria *«secreto nuevo sin IAM rompe deploy»*).

---

## 4. Fases

### F0 — Medir · *sin código*
- [x] D1, D3, D6 y D9 decididas (16-nov).
- [ ] D4, D5, D7 y D8: valen los valores por defecto si Carles no dice otra cosa.
- [x] **Medido en PROD el 16-nov** (`runsql.sh`, sólo lectura, con consulta de control y comprobación de que las tablas
      existen):
      - **Plantillas guardadas: 0** de Legifirma y 0 de Pólizas. `document_templates` tiene una sola fila en PROD, de
        Tramitación (`actas:bmn:certificados`, Micó), fuera de alcance. **No hay nada que convertir**: todas las
        notarías usan el texto por defecto del catálogo.
      - **Word de membrete subidos: 0.** `docfilling_plantilla_estilo` está vacía; tampoco Redactor tiene ninguno en
        PROD. Al principio todas las plantillas saldrán con la carta genérica (D8) hasta que la notaría suba el suyo.
      - **Claves `notaria_*`: 0 en toda la tabla `configuracion`.** Las 49 organizaciones con datos tienen sólo
        claves `org.*` (`org.nombre_comercial`, `org.direccion`, `org.telefono`, `org.email_contacto`, `org.cif`).
        No hay nada que copiar a los predefinidos.
      - **Predefinidos:** sólo Micó, con `CCAA_NOTARIA` y `COLEGIO_NOTARIAL`. El resto los deriva Redactor al vuelo.
      - **Uso real, sólo Micó:** 1 recibo de provisión en total (9-sep); 23 traslados a papel con oficio (1 en los
        últimos 30 días); **214 pólizas (168 en 30 días)**. La diligencia es la plantilla que importa. No hay registro
        de cada documento generado, así que esto es lo que pudo generarse, no lo que se generó.
- [x] **Hallazgo: hoy los tres documentos salen con datos de la notaría vacíos en PROD**, porque leen `notaria_*` y nadie
      las ha rellenado:
      - Recibo: dirección, ciudad, teléfono, correo y web vacíos; la ciudad de la firma sale `____` (sólo el nombre
        viene de la organización).
      - Oficio: nombre del notario, colegio y población vacíos.
      - Diligencia: nombre del notario y colegio vacíos, y la ciudad de la firma `____`. Nombre y dirección de la notaría
        sí salen (`org.nombre_comercial`, `org.direccion`).
      Se resuelve dentro del plan (§3.6); **arreglo aparte descartado por Carles (16-nov)**.

### F1 — `sharedlib` · repo `shared`
- [ ] `BodyFormat` + `'DOCFILLING'`.
- [ ] Subpath `document-docfilling`: `componerPlantillaDocFilling` (→ markdown + warnings), `validarPlantillaDocumento`,
      `textoPlano` (#127).
- [ ] Predefinidos de la notaría (§3.6) con su puerto Prisma, más los tres nuevos.
- [ ] Almacén y escalera de plantillas de estilo (§3.3), con el prefijo por app; carta genérica (D8) como recurso del
      paquete.
- [ ] Tests: condición, `ELSE`, `FOR EACH` con lista JSON, formatos en `es` y `ca`, campo vacío (D4), inyección,
      campo fuera de catálogo, `SYSTEM:` desconocido, directiva prohibida, W056 filtrado, escalera sin caer en `TODOS`.

### F2 — Redactor sobre las piezas subidas · repo `redactor`
- [ ] `predefinidos.ts`, `plantillas/almacen.ts` y la escalera pasan a importar de `sharedlib`. **Sin cambio de
      resultado**: comparar `predefinidosDeOrg` y la plantilla elegida antes y después en las organizaciones de LOCAL,
      y regenerar una escritura de referencia.

### F3 — Esquema compartido · repo `platform`
- [ ] Ámbito `DOCUMENTO` en `DocfillingPlantillaEstilo` (D9), con un solo Word activo por `ambitoCodigo` (migración en el esquema canónico; ojo con la memoria
      *«migración platform sola: --force»*). Espejos de Prisma de Redactor, Legifirma y Pólizas al día.

### F4 — `ui`: modo DocFilling del editor · repo `shared`
- [ ] `docfilling-lang`/`docfilling-theme` a `ui`; Redactor importa de `ui`.
- [ ] Modo `DOCFILLING` de `DocumentTemplatesManager` (§3.5): editor, paleta en dos grupos, diagnósticos, vista previa
      en pantalla + Word de prueba, apartado Membrete.
- [ ] Contrato de la API documentado en el componente (`GET` devuelve `bodyFormat` y predefinidos; `PUT` puede
      devolver 422 con `diagnostics`; rutas de membrete).
- [ ] i18n (`ui.documentTemplates.*`) en los cuatro idiomas.

### F5 — Legifirma
- [ ] Rutas de plantillas (`api/admin/document-templates`, `[eventKey]`, `preview`) con F1; rutas de membrete.
- [ ] `RECIBO_PROVISION` y `OFICIO_TRASLADO` reescritas en DocFilling (D3, D5, D8). `buildOficioMacros` adelgaza:
      entrega `TIPO_DOC`, `ORDEN_FOLIOS` y la fecha en ISO; **desaparecen** las cuatro macros derivadas y `fechaLarga`.
- [ ] `provision-recibo` y `oficio` devuelven **`.docx`**; el oficio conserva `?format=texto`. Los botones y textos de
      la ficha de la actuación dicen «Word», y el manual (cuatro idiomas) se actualiza.
- [ ] ~~Copia `notaria_*` → predefinidos y conversión de filas guardadas~~: **no hace falta** (F0: 0 claves, 0 filas).
      Se retira la lectura de `notaria_*` y sus parámetros de Config.
- [ ] Generar el recibo y el oficio (escritura y póliza) con el Word de Micó y con la carta genérica, y abrirlos en Word
      (memoria *«.xlsx de script: abrir con Excel»*: vale igual para un `.docx`).

### F6 — Pólizas
- [ ] Ruta de plantillas (`api/catalogs/document-templates`) con F1; rutas de membrete.
- [ ] `INTERVENCION_POLIZA` en DocFilling, castellano y catalán (una fila por `idioma`, como hoy; el idioma lo decide
      la tabla, no la declaración de lengua del motor). `comparecientes` → lista JSON +
      `{{FOR EACH ITEM IN COMPARECIENTES}}…{{ITEM.NOMBRE}}…{{ENDFOR}}`; varios acreedores igual (#1063).
- [ ] `polizas/[id]/intervencion` sólo `.docx`; fuera el PDF y `markdownToDocumentHtml`.
- [ ] ~~Conversión de filas `MARKDOWN` guardadas~~: **no hace falta en PROD** (F0: 0 filas). Antes de F7, mirar TEST y
      LOCAL por si hay filas de prueba, que se borran.
- [ ] Mantenimientos → Intervención pasa a `DocumentTemplatesManager` en modo DocFilling.

### F7 — Pruebas y despliegue
- [ ] e2e LOCAL sólo de los specs afectados: editar, error de validación visible, subir membrete, Word de prueba y
      generación del recibo, del oficio y de la diligencia (castellano y catalán).
- [ ] Publicar `sharedlib` y `ui` **a mano** si hay sesiones paralelas (`publish-package.sh ui` re-sincroniza las
      quince consumidoras).
- [ ] LOCAL (avisando antes a Lanzamiento). **TEST y PROD sólo con OK expreso de Carles.**

---

## 5. Riesgos

| Riesgo | Cómo se cubre |
|---|---|
| Un paso más en el mostrador para imprimir el recibo (Word en vez de PDF) | Asumido en D6 |
| La oficina ve `{{IF …}}` y se asusta | Pocas plantillas y se tocan poco. Paleta, botones de inserción, restaurar. El editor avanzado de Doku lo sustituiría sin cambiar el resto |
| Que un recibo salga con la geometría de escritura | La escalera de estas plantillas no mira `TODOS` (§3.3) + test |
| Romper Redactor al subir sus piezas a `sharedlib` | F2 compara antes/después y regenera una escritura de referencia |
| Romper una plantilla ya ajustada | F0 mide primero; el formato es por fila (§3.1) |
| Un nombre de cliente que inyecta formato | Escapado markdown de los campos de dato + test (§3.2) |
| Datos de la notaría distintos en cada app durante la transición | Copia única `notaria_*` → predefinidos, y la clave de la app deja de leerse |
| `docfilling-core` cambia a menudo (0.1.x) | `peerDependency` con versión fijada; los tests de F1 son la red |
| Peso de CodeMirror en `ui` | Carga diferida |
| Confundir estas plantillas con los esquemas de Redactor | D1: no tocan biblioteca, catálogo ni sesión de Catálogo |

---

## Notas

**16-nov — F0 hecha.** Resultado arriba (§4, F0). El plan se simplifica: sin plantillas guardadas que convertir ni claves
`notaria_*` que copiar, F5 y F6 pierden sus pasos de migración de datos. Lo que sale de la medición es un fallo **actual**,
independiente del plan: los tres documentos leen datos de la notaría de claves que no existen en PROD. Arreglo aparte
propuesto, sin esperar al plan: que lean lo que sí hay (`org.*` de la configuración y los predefinidos del notario y del
colegio) en `provision-recibo/route.ts`, `oficio-traslado.ts` y `polizas/[id]/intervencion/route.ts`. **Carles lo
descarta (16-nov): no se hace arreglo aparte; se resuelve dentro del plan (§3.6).**
