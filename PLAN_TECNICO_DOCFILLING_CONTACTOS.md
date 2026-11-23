# PLAN TÉCNICO — Datos de contactos en las plantillas DocFilling: `{{SYSTEM:CONTACT:…}}`

> Estado: **Propuesta sin código. Pendiente de que Carles decida D1–D6 (§6)** · Fecha: 23-nov-2026 · Repo dueño: `mycolegal-shared` (`packages/docfilling-core`)
>
> **Repos afectados:**
> - `mycolegal-shared`: `docfilling-core` (sintaxis, validador, motor).
> - `mycolegal-platform`: migración de `clientes.codigoLocal` y carga del directorio global.
> - `mycolegal-redactor`: lectura del directorio, preguntas de opciones y manual de sintaxis.
> - `mycolegal-notaria`: el código del contacto en la ficha de clientes.
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

### 5.2 Directorio global y directorio de la notaría (D2)

- Las gestorías que trabajan con muchas notarías (PONS, GARSA, GRUPO BC, E-Ulises…) van en un **directorio global**: filas de `clientes` de la organización de sistema (`_system`).
- Cada notaría puede tener sus propios contactos con código, y **un código propio gana al global**. Es el mismo patrón que la biblioteca: lo global, con ajuste de la organización.
- El directorio global se mantiene como un **fichero de la biblioteca** (`_PROD/contactos/directorio.yaml` en el Drive). `cargar-biblioteca-esquemas.sh` lo carga en el mismo flujo LOCAL → TEST → PROD, con su auditoría. No hace falta otra pantalla de administración y queda versionado con las plantillas que lo usan.

### 5.3 Quién resuelve qué

- `docfilling-core` es puro (no toca la BD) y lo sigue siendo. Recibe el directorio en las opciones de composición (`OpcionesComposicion.contactos: ContactoDF[]`) y hace él la selección: código, variable o patrón, la unicidad, los formatos y los huecos.
- Además expone `contactosReferidos(texto)`: la lista de selectores y campos que usa una plantilla. Sirve para la auditoría y para que Redactor sepa qué tiene que preguntar.
- **Redactor** lee el directorio de la organización (código propio sobre global), se lo pasa al motor y expande `SYSTEM:CONTACTS:` en las opciones de las preguntas. Al generar, apunta en `valoresFuente` qué contacto y qué versión usó (`fuente: 'contacto'`, id, `updatedAt`).
- La escritura entregada ya queda congelada en `markdownFinal`. Cambiar mañana un teléfono **no altera** lo que ya está firmado.

### 5.4 Validación

Diagnósticos nuevos en el rango propio `E9xx`/`W9xx` (el siguiente libre):
- **E:** `SYSTEM:CONTACT` sin campo, o con un campo que no existe (`.FAX`).
- **E:** selector mal formado: corchetes sin cerrar, variable no declarada.
- **W:** patrón en un valor (no en opciones). Es legal, pero da ambigüedad si casa más de uno.

En la carga de la biblioteca, una auditoría nueva **«contactos»**:
- **avisa** de los códigos literales que no existen en el directorio global (una notaría podría tenerlos);
- **falla** con los patrones de opciones que no casan ningún contacto global.

## 6. Decisiones para Carles

| # | Decisión | Propuesta |
|---|---|---|
| **D1** | Nombre de la sintaxis | `{{SYSTEM:CONTACT:<sel>.<CAMPO>}}` para un valor y `SYSTEM:CONTACTS:<patrón>` para listas. Alternativa más corta: `{{CONTACT:…}}` sin `SYSTEM:`. Propongo mantener `SYSTEM:`, como pediste: el editor y el validador ya lo tratan como espacio de nombres |
| **D2** | Directorio global además del de cada notaría | Sí: directorio global en `_system`, mantenido como fichero de la biblioteca (§5.2), y el código propio de la notaría gana |
| **D3** | Qué mira el comodín | Código y nombre, sin acentos ni mayúsculas. Filtro de tipo aparte (`tipo=GESTORIA`), para no depender de que el nombre empiece por «Gestoría» (hoy E-Ulises y PONS no lo hacen) |
| **D4** | El código | Reutilizar `clientes.codigoLocal`, que ya significa «código de gestoría» en Tramitación y está vacío en PROD, **ensanchándolo de 8 a 32** (`GESDEK_MADRID` tiene 13) y con unicidad por organización. Hay que comprobar en Tramitación que nada depende de los 8 caracteres |
| **D5** | Hueco sin dato | `[NO DISPONIBLE]` / `[CONTACTO … NO ENCONTRADO]`. Redactor bloquea «dar por buena» la escritura y dice dónde se corrige. Nunca texto vacío |
| **D6** | Quién edita los contactos de la notaría | La ficha de clientes de Notaría gana el campo «Código para plantillas» (solo si es gestoría, banco o asesor). El global lo mantiene Catálogo en el fichero |

## 7. Fases

| Fase | Qué | Quién | Tamaño aprox. |
|---|---|---|---|
| **F0** | Decisiones D1–D6 y, con Tramitación, confirmar que se puede ensanchar `codigoLocal` | Carles, B&F | — |
| **F1** | **Datos.** Migración: `codigoLocal` a VarChar(32) e índice único parcial `(orgId, codigoLocal)`. Fichero `contactos/directorio.yaml` con las 15 entradas que hoy están escritas en la plantilla (GRUPO BC en dos: `GRUPO_BC_BS` y `GRUPO_BC_CB`), sacadas del texto actual y repasadas con Iván. Carga en `_system` desde `cargar-biblioteca-esquemas.sh` | B&F (migración y carga), Catálogo (fichero) | 1,5 j |
| **F2** | **Motor** (`docfilling-core`): parser y validador de `SYSTEM:CONTACT`/`CONTACTS`, selección (código, variable, patrón), campos compuestos, formatos, condiciones, huecos y avisos, `contactosReferidos()`. Tests, incluidos los de unicidad y acentos. Manual de sintaxis (`redactor/docs/sintaxis/`, cuyos ejemplos son test). Publicar versión | B&F | 2–3 j |
| **F3** | **Redactor**: leer el directorio (propio sobre global) y pasarlo a `compose`; expandir `SYSTEM:CONTACTS` en las opciones; puerta de «dar por buena» con huecos de contacto; `valoresFuente`; autocompletar códigos en el editor de la biblioteca | B&F | 2 j |
| **F4** | **Notaría**: campo «Código para plantillas» en la ficha de clientes (gestoría, banco, asesor), con unicidad por organización | B&F | 0,5 j |
| **F5** | **Biblioteca**: reescribir `PARR_TRAMITACION_REGISTRAL_3_REPRESENTANTE_CB` y su VAR. Una sola frase de designación con campos condicionados, la comunicación de aranceles leyendo `EMAIL`/`TELEFONO` y las opciones desde `SYSTEM:CONTACTS:tipo=GESTORIA`. Auditoría «contactos» en la carga. Comprobar con el motor los casos de la #1103 (E-Ulises, GARSA, GRUPO BC por banco, sin gestoría) | Catálogo | 1 j |
| **F6** | LOCAL → prueba de Redactor (cancelación Sabadell) → TEST con e2e → PROD. El orden importa: directorio cargado **antes** que la biblioteca que lo lee | Todos, con el OK de Carles en cada entorno | — |

Total aproximado: **7–8 jornadas**, la mayor parte de B&F.

## 8. Riesgos

- **Directorio vacío.** Si F1 no se hace bien, las plantillas reescritas en F5 saldrían llenas de huecos. Por eso F5 no se carga en ningún entorno sin la auditoría «contactos» limpia en ese mismo entorno.
- **Ambigüedad de los comodines.** `Gestoría*` en un valor puede casar varios contactos el día que una notaría dé de alta otra gestoría. Por eso es aviso del validador y hueco visible, nunca «el primero que salga».
- **Datos personales.** Solo contactos con código (§5.1). Un particular no tiene código, así que no puede salir en una plantilla por un comodín.
- **Legifirma y Pólizas** (`PLANTILLAS_DOCFILLING_APPS`): si su F-correspondiente llega antes, `CONTACT` debe entrar en la lista de `SYSTEM:` conocidos que valida su editor.
