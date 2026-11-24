# PLAN TÉCNICO — Datos de contactos en las plantillas DocFilling: `{{SYSTEM:CONTACT:…}}`

> Estado: **Decisiones D1–D6 cerradas por Carles (24-nov-2026, §6). Sin código. Siguiente: F1** · Fecha: 23-nov-2026, revisado 24-nov-2026 · Repo dueño: `mycolegal-shared` (`packages/docfilling-core`)
>
> **Repos afectados:**
> - `mycolegal-shared`: `docfilling-core` (sintaxis, validador, motor).
> - `mycolegal-platform`: migración de `clientes.codigoLocal` (ancho y unicidad).
> - `mycolegal-redactor`: lectura del directorio, preguntas de opciones y manual de sintaxis.
> - `mycolegal-notaria`: tipo GESTORÍA y «Código para plantillas» editables en Contactos.
> - `mycolegal-tramitacion`: su catálogo de gestorías usa el mismo código (sin cambios, salvo el ancho).
> - Biblioteca DocFilling (Drive `_PROD`/`_DEV`): la reescriben las plantillas de gestorías.
>
> **Relación con otros planes:**
> - `PLAN_TECNICO_PLANTILLAS_DOCFILLING_APPS.md`: sube los campos `SYSTEM:` de la notaría a `sharedlib`. `CONTACT` es un espacio más dentro de `SYSTEM:`, así que lo que se haga aquí lo heredan Legifirma y Pólizas sin trabajo extra.
>
> Cuando llegue al 100 % → mover a `completed/`.

---

## 1. Objetivo

Que una plantilla pueda **leer los datos de un contacto de la base de datos** (razón social, NIF, domicilio, teléfono, correo), en vez de llevarlos escritos a mano:

```
* "{{SYSTEM:CONTACT:EULISES.NOMBRE}}", con domicilio en {{SYSTEM:CONTACT:EULISES.DOMICILIO}}, teléfono {{SYSTEM:CONTACT:EULISES.TELEFONO}}
```

El contacto se puede nombrar de tres formas:
- por su **código** (`EULISES`);
- por una **variable** de la plantilla (`[REPRESENTANTE_FISCAL_REGISTRAL]`);
- por un **patrón con comodines** (`Gestoría*`).

El patrón sirve sobre todo para construir la lista de opciones de una pregunta.

## 2. Por qué

Lo ha destapado la incidencia #1103 (23-nov, Iván, notaría Micó).
- `PARR_TRAMITACION_REGISTRAL_3_REPRESENTANTE_CB` tenía escrito el teléfono de E-Ulises **mal y distinto en dos frases** (902102937 en la designación y 937156389 en la comunicación de aranceles).
- Ese párrafo lleva **15 ramas `IF`**, una por gestoría, con domicilio, NIF, teléfono y correo escritos a mano. GRUPO BC está dos veces, con dos domicilios según el banco.

Hoy cambiar un teléfono obliga a editar la biblioteca, auditarla y cargarla en LOCAL, TEST y PROD. Con este plan, la notaría corrige la ficha del contacto y la siguiente escritura ya sale bien.

## 3. Lo que hay hoy (medido el 23-nov-2026)

| Pieza | Situación |
|---|---|
| `{{SYSTEM:X}}` en el motor | `engine.ts` sustituye `SYSTEM:X` por el campo `X` de los valores; si falta, `[NO DISPONIBLE]`. Lo rellena Redactor con los predefinidos de la notaría (`predefinidos.ts`: `NOMBRE_NOTARIO`, `COMUNIDAD_AUTONOMA`…). Admite formatos (`#upper`…) |
| Contactos | Tabla `clientes` (modelo `Cliente`), **por organización**: `tipo`, `nombre`, `apellidos`, `razonSocial`, `nif`, `telefono`, `email`, `direccion`, `codigoPostal`, `ciudad`, `provincia`, `tipoExterno` (NINGUNO/GESTORIA/ASESOR/BANCO/INTERESADO) y **`codigoLocal` (VarChar 8)** |
| `codigoLocal` | Ya es «el código corto de una gestoría»: lo usa Tramitación en su catálogo de gestorías (`api/gestorias-catalogo`, expedientes, postfirma). **En PROD: 0 filas con código** |
| Datos en PROD | 52.772 clientes en 2 orgs; **5 con tipo GESTORIA**, ninguno con teléfono ni correo. E-Ulises existe como «GESTORIA EULISES», tipo NINGUNO, **sin NIF ni teléfono**. Sin poblar el directorio, la sintaxis no daría nada útil |
| Plantillas afectadas hoy | `PARR_TRAMITACION_REGISTRAL_3_REPRESENTANTE_CB` y su VAR, con 15 gestorías, la notaría Micó y la comunicación de aranceles de 4 de ellas. Se incluyen en 9 esquemas de cancelación (1302, 1304) |

### 3.1 Las gestorías que ya reconoce Tramitación (medido en PROD el 24-nov-2026)

Hay **dos clases**, y las dos tienen su fila en `clientes` de la notaría:

- **Gestorías de portal.** Son organizaciones de `type = GESTORIA`, dadas de alta en Admin y vinculadas a la notaría
  con `organization_links.relacion = GESTORIA_DE`. Tienen su ficha en `clientes`, con `auth_org_id`.
  - En PROD hay 6: Aktua, Egara Optiminn, Emais, Lexer, Garsa y TecnoTramit.
  - Micó tiene vinculadas 4: Aktua, Egara, Emais y Lexer.
  - La organización no guarda NIF, teléfono ni domicilio; esos datos están en la ficha de `clientes`.
- **Catálogo local de gestorías** (`api/gestorias-catalogo` de Tramitación). Son filas de `clientes` con
  `tipoExterno = GESTORIA`, sin `auth_org_id` y con `codigoLocal`.
  - En PROD hay 1 (Gestoría Arnal), sin código.

Ninguna de las dos tiene hoy las gestorías que escribe a mano la plantilla de cancelaciones (E-Ulises, PONS, GRUPO BC,
Centropex, Indra, Maretra, Amstro, Molsan, Gesdek, Sertyf). Garsa existe como organización, pero Micó no la tiene
vinculada. En Notaría, Contactos **muestra** el tipo pero no deja elegirlo: la API lo admite con el permiso
`clientes:tipoExterno:write`. El código no se puede editar en Notaría.

## 4. La sintaxis

### 4.1 Un valor: `{{SYSTEM:CONTACT:<selector>.<CAMPO>[#formato]}}`

Selectores:

| Selector | Ejemplo | Qué hace |
|---|---|---|
| Código | `EULISES` | El contacto con ese código |
| Variable | `[REPRESENTANTE_FISCAL_REGISTRAL]` | El contacto cuyo código es el **valor** de la variable. Los corchetes marcan que es una variable y no un código. No se pueden usar llaves dentro de `{{…}}` |
| Patrón | `Gestoría*`, `*ULISES*` | Comodín `*` (cualquier texto, también vacío) en cualquier posición. Casa contra el **código y el nombre** del contacto, sin distinguir mayúsculas ni acentos y con los espacios normalizados: `Gestoría*` casa «GESTORIA EULISES» y «Gestoría Arnal, S.L.» |

Campos:
- Básicos: `NOMBRE` (razón social, o nombre y apellidos si es persona física), `NIF`, `TELEFONO`, `EMAIL`, `DIRECCION`, `CP`, `CIUDAD`, `PROVINCIA`.
- `DOMICILIO`: compuesto como «calle…, CP Ciudad (Provincia)».
- `TIPO`: GESTORIA, BANCO…
- Admiten los formatos de siempre: `{{SYSTEM:CONTACT:EULISES.NOMBRE#upper}}`.

Reglas:
- En un **valor**, el selector tiene que dar **exactamente un** contacto.
  - Si no da ninguno: `[CONTACTO «EULISES» NO ENCONTRADO]` y un aviso.
  - Si da varios: `[CONTACTO «Gestoría*» AMBIGUO: …]`, con los candidatos, y un aviso.
  - En los dos casos **nunca sale un texto vacío**: el hueco se ve y Redactor no deja dar la escritura por buena.
- Un **campo vacío** en la ficha (el contacto existe pero no tiene teléfono) da `[NO DISPONIBLE]`, como hoy un `SYSTEM:` sin valor. Redactor lo señala diciendo **dónde se corrige** (la ficha del contacto, no la plantilla).

### 4.2 Las opciones de una pregunta: `SYSTEM:CONTACTS:<patrón>`

```
{{DECLARE REPRESENTANTE_FISCAL_REGISTRAL:INPUT(Seleccione el representante fiscal y registral|Notario,Propio_Interesado,SYSTEM:CONTACTS:Gestoría*)}}
```

- Las opciones fijas se mantienen. `SYSTEM:CONTACTS:<patrón>` se sustituye por **un elemento por cada contacto que case**.
- El **valor guardado es el código** (estable) y la **etiqueta es el nombre**. Así los `{{IF REPRESENTANTE_FISCAL_REGISTRAL == "EULISES"}}` de hoy siguen funcionando.
- Filtro por tipo, sin depender del nombre: `SYSTEM:CONTACTS:tipo=GESTORIA` y combinable, `SYSTEM:CONTACTS:tipo=GESTORIA;Ges*` (ver D3).

### 4.3 En condiciones

`{{IF SYSTEM:CONTACT:[REPRESENTANTE_FISCAL_REGISTRAL].EMAIL}}…{{ENDIF}}` es verdadero si el contacto existe y tiene ese campo. Sirve para que una sola frase valga para todas las gestorías: «…, correo {{…EMAIL}}» solo si lo tiene.

### 4.4 Fuera de este plan

- Recorrer contactos con `FOR EACH`: no hay caso de uso.
- Escribir en contactos desde una plantilla.
- Contactos de un expediente concreto. Eso son los intervinientes y van por `:REQ(SUJETO…)`.

## 5. Dónde viven los datos y cómo se resuelven

### 5.1 Qué contactos se pueden usar desde una plantilla

**Solo los que tienen código** (`codigoLocal`). Es a la vez una salvaguarda y la forma de mantener el directorio:
- **Privacidad:** un comodín nunca recorre los 52.772 clientes, que incluyen particulares. Solo entra lo que alguien ha puesto a disposición de las plantillas dándole un código.
- **Rendimiento:** el directorio de una notaría son decenas de filas, no miles.

### 5.2 De dónde salen los contactos (D2, decidido 24-nov-2026)

**No hay directorio común aparte.** Las plantillas leen las gestorías (y bancos y asesores) que la notaría ya
tiene en `clientes` con código: las del catálogo local de Tramitación y las de portal, por su ficha de cliente. Así,
**Tramitación, Notaría y las plantillas ven la misma lista.** Dar de alta una gestoría para usarla en una plantilla
es darla de alta en **Contactos de Notaría** con tipo GESTORÍA, su código y sus datos. No hace falta tocar la
biblioteca ni cargar nada.

Consecuencia: cada notaría tiene sus propias gestorías. Una plantilla global que nombre `EULISES` sólo encuentra el
contacto en las notarías que lo tengan; en las demás, hueco visible (D5) y Redactor dice dónde se da de alta.

### 5.3 Quién resuelve qué

- `docfilling-core` es puro (no toca la BD) y lo sigue siendo. Recibe el directorio en las opciones de composición (`OpcionesComposicion.contactos: ContactoDF[]`) y hace él la selección: código, variable o patrón, la unicidad, los formatos y los huecos.
- Además expone `contactosReferidos(texto)`: la lista de selectores y campos que usa una plantilla. Sirve para la auditoría y para que Redactor sepa qué tiene que preguntar.
- **Redactor** lee los contactos con código de la organización, se los pasa al motor y expande `SYSTEM:CONTACTS:` en las opciones de las preguntas. Al generar, apunta en `valoresFuente` qué contacto y qué versión usó (`fuente: 'contacto'`, id, `updatedAt`).
- La escritura entregada ya queda congelada en `markdownFinal`. Cambiar mañana un teléfono **no altera** lo que ya está firmado.

### 5.4 Validación

Diagnósticos nuevos en el rango propio `E9xx`/`W9xx` (el siguiente libre):
- **E:** `SYSTEM:CONTACT` sin campo, o con un campo que no existe (`.FAX`).
- **E:** selector mal formado: corchetes sin cerrar, variable no declarada.
- **W:** patrón en un valor (no en opciones). Es legal, pero da ambigüedad si casa más de uno.

En la carga de la biblioteca, una auditoría nueva **«contactos»**:
- **informa** de los códigos literales y patrones que usa cada plantilla (no puede fallar: los contactos son de cada
  notaría, no de la biblioteca);
- y, en cada entorno, **avisa** de qué notarías con la plantilla contratada no tienen esos códigos en Contactos.

## 6. Decisiones (cerradas por Carles el 24-nov-2026)

| # | Decisión | Decidido |
|---|---|---|
| **D1** | Sintaxis | `{{SYSTEM:CONTACT:<sel>.<CAMPO>}}` para un valor y `SYSTEM:CONTACTS:<patrón>` para listas |
| **D2** | De dónde salen | **De los contactos de la notaría** (catálogo local de Tramitación y gestorías de portal, por su ficha de `clientes`). Sin directorio común (§5.2) |
| **D3** | Qué mira el comodín | Código y nombre, sin acentos ni mayúsculas, más filtro de tipo aparte (`tipo=GESTORIA`) |
| **D4** | El código | `clientes.codigoLocal`, ensanchado de 8 a 32 y único por organización. Es el mismo código que usa Tramitación; hay que comprobar que nada depende de los 8 caracteres |
| **D5** | Hueco sin dato | `[NO DISPONIBLE]` / `[CONTACTO … NO ENCONTRADO]`; Redactor bloquea «dar por buena» y dice dónde se corrige. Nunca texto vacío |
| **D6** | Quién edita | Notaría, en Contactos: tipo GESTORÍA/BANCO/ASESOR elegible (con `clientes:tipoExterno:write`) y «Código para plantillas», obligatorio y único cuando el tipo es gestoría. También vale para las fichas de las gestorías de portal |

## 7. Fases

| Fase | Qué | Quién | Tamaño aprox. |
|---|---|---|---|
| **F0** | Decisiones D1–D6 y, con Tramitación, confirmar que se puede ensanchar `codigoLocal` | Carles, B&F | — |
| **F1** | **Datos.** Migración: `codigoLocal` a VarChar(32) e índice único parcial `(orgId, codigoLocal)`. Alta en los Contactos de **Micó** de las gestorías que hoy escribe a mano la plantilla (con código, NIF, domicilio, teléfono y correo, sacados del texto actual y repasados con Iván; GRUPO BC en dos: `GRUPO_BC_BS` y `GRUPO_BC_CB`), y códigos a las cuatro de portal vinculadas | B&F (migración), Catálogo e Iván (datos) | 1,5 j |
| **F2** | **Motor** (`docfilling-core`): parser y validador de `SYSTEM:CONTACT`/`CONTACTS`, selección (código, variable, patrón), campos compuestos, formatos, condiciones, huecos y avisos, `contactosReferidos()`. Tests, incluidos los de unicidad y acentos. Manual de sintaxis (`redactor/docs/sintaxis/`, cuyos ejemplos son test). Publicar versión | B&F | 2–3 j |
| **F3** | **Redactor**: leer el directorio (propio sobre global) y pasarlo a `compose`; expandir `SYSTEM:CONTACTS` en las opciones; puerta de «dar por buena» con huecos de contacto; `valoresFuente`; autocompletar códigos en el editor de la biblioteca | B&F | 2 j |
| **F4** | **Notaría**: en Contactos, elegir el tipo (GESTORÍA, BANCO, ASESOR) con el permiso `clientes:tipoExterno:write` y el campo «Código para plantillas», obligatorio y único en la notaría cuando el tipo es gestoría | B&F | 1 j |
| **F5** | **Biblioteca**: reescribir `PARR_TRAMITACION_REGISTRAL_3_REPRESENTANTE_CB` y su VAR. Una sola frase de designación con campos condicionados, la comunicación de aranceles leyendo `EMAIL`/`TELEFONO` y las opciones desde `SYSTEM:CONTACTS:tipo=GESTORIA`. Auditoría «contactos» en la carga. Comprobar con el motor los casos de la #1103 (E-Ulises, GARSA, GRUPO BC por banco, sin gestoría) | Catálogo | 1 j |
| **F6** | LOCAL → prueba de Redactor (cancelación Sabadell) → TEST con e2e → PROD. El orden importa: los contactos de Micó dados de alta **antes** que la biblioteca que los lee | Todos, con el OK de Carles en cada entorno | — |

Total aproximado: **8 jornadas**, la mayor parte de B&F.

## 8. Riesgos

- **Contactos vacíos.** Si F1 no se hace bien, las plantillas reescritas en F5 saldrían llenas de huecos. Por eso F5 no se carga en ningún entorno sin la auditoría «contactos» limpia en ese mismo entorno.
- **Ambigüedad de los comodines.** `Gestoría*` en un valor puede casar varios contactos el día que una notaría dé de alta otra gestoría. Por eso es aviso del validador y hueco visible, nunca «el primero que salga».
- **Datos personales.** Solo contactos con código (§5.1). Un particular no tiene código, así que no puede salir en una plantilla por un comodín.
- **Legifirma y Pólizas** (`PLANTILLAS_DOCFILLING_APPS`): si su F-correspondiente llega antes, `CONTACT` debe entrar en la lista de `SYSTEM:` conocidos que valida su editor.
