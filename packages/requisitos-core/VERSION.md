# @mycolegal-app/requisitos-core

## Sin publicar (próxima: 0.3.3)

- **Escenarios base en el paquete** (`escenarioPara`, `escenariosDelActo`, `presuncionesDe`, y las
  piezas puras `elegirEscenario`, `componerTransversales`, `aplicarAjustes`). Hasta ahora el motor
  sólo sabía APLICAR presunciones; elegir el escenario y heredar las presunciones transversales
  (GLOBAL < familia < subfamilia < escenario < notaría) existía sólo en Consultor, y el Redactor
  llamaba al motor sin ninguna: en una compraventa, **69 preguntas en vez de 4** (más las 7 que el
  caso pregunta siempre). Subido tal cual: **472 de 472** combinaciones acto × comunidad dan el
  mismo escenario que Consultor en LOCAL. Nuevo: elegir **por esquema DocFilling**
  (`{ esquema }`, `como: 'POR_ESQUEMA'`), que es lo que sabe el Redactor.
- **El puerto gana tres métodos OPCIONALES**: `escenariosDeActo`, `presuncionesTransversales` y
  `ajustesDePresuncion`. Un repositorio que no los tenga sigue funcionando y el acto va sin
  escenario, como hasta ahora: no rompe a nadie. El adaptador de `sharedlib` los implementa si el
  cliente Prisma de la app tiene los modelos (`actoEscenarioBase`, `presuncionTransversalGlobal`,
  `actoPresuncionOverride`).

## 0.3.2 — 8-oct-2026

- **Datos que se deducen del rol** (`DEDUCIDO_DEL_ROL`). `SUJETO.DISPONE_DE_SUS_BIENES` ya no
  hay que preguntarlo cuando el interviniente tiene rol: lo que cuelga de DISPONENTE (vendedor,
  donante…) dispone y lo que cuelga de ADQUIRENTE no. No se puede presumir —una presunción vale
  igual para todos los intervinientes y callaba la autorización judicial cuando vende un menor—;
  el catálogo lo prohíbe desde las presunciones transversales del 8-oct. Un rol fuera de las dos
  ramas o un interviniente sin rol sigue en duda; un dato del expediente manda siempre, y lo
  deducido manda sobre una presunción. Sin cambios en el puerto ni en quien llama.
- **La específica desplaza a la general sólo si la cubre.** La precedencia por especificidad
  comparaba la coordenada (documento, comunidad y ejes `cond*`) sin mirar condiciones, roles ni
  objetos, y una regla del acto más estrecha se llevaba por delante un requisito transversal:
  el título previo entre comuneros solteros (0507), el poder del donante (0701, GLOBAL-R04). Ahora
  desplaza sólo si tiene las mismas condiciones o ninguna, roles y tipos de bien que abarcan los
  de la otra (el tipo base del acto no estrecha). Si no, salen las dos. Medido sobre el catálogo
  del 8-oct en LOCAL: 8 actos recuperan reglas (0501, 0504, 0505, 0507, 0515, 0701, 1103, 1104),
  ninguno pierde ninguna; 17 casos de oro en verde.
  ⚠️ **Al publicar**, la instantánea de `consultor/scripts/regresion-catalogo` cambia en esos 8
  actos: cargar en LOCAL, revisar el informe y aceptarla (`--aceptar`) antes de subir el catálogo.

## 0.3.1 — 8-oct-2026

- **Evaluador: lectura de datos aparte.** Antes de evaluar el cumplimiento, una sola llamada
  lee los datos que le faltan al motor, por su nombre y con sus opciones; el motor decide con
  ellos. Pedidos requisito a requisito, el modelo repetía el tipo del vendedor diez veces y se
  saltaba el medio de pago. Medido en un trabajo real: preguntas pendientes 51 → 41, datos
  leídos 14 → 38, 126 s → 65 s. Cada «puede aplicar» dice además qué datos le faltan.
- **Pregunta de tipo: los tipos pedidos y «Ninguno de estos»** (`TIPO_NINGUNO =
  'NINGUNO_DE_ESTOS'`), decisión de Carles. Sustituye a ofrecer los tipos hermanos (0.3.0), que
  llenaba el panel de opciones que ninguna regla pide. «Ninguno» no está en la jerarquía, así
  que el motor lo trata como un tipo conocido distinto de los pedidos y descarta esas reglas.

## 0.3.0 — 8-oct-2026

**Un solo motor.** Consultor deja su copia (`consultor/src/lib/requisitos/motor.ts`, que ya
discrepaba) y usa este paquete; lo que sólo tenía la copia sube aquí:

- **Reglas transversales** (`TODOS`, `FAMILIA`, `SUBFAMILIA`) con **precedencia por
  especificidad**: dos reglas que piden lo mismo bajo las mismas condiciones → gana la más
  específica (acto > subfamilia > familia > todos). Hasta ahora Redactor no veía ni una.
- Ejes **causa** (`ACTO.CAUSA`) y **medio de pago** (`ACTO.MEDIO_PAGO`, operador `INCLUYE`
  sobre listas), combinados con AND con las condiciones.
- **Presunción exacta** de tipos: un tipo presumido por el escenario es el caso ordinario y
  lo excepcional se presume falso.
- `ambito` en cada requisito; `transversales` y `desplazadasPorEspecificidad` en el diagnóstico.

⚠️ **Rompe el puerto**: `ReglaGolden` gana `ambito`, `condObjeto`, `condSujeto`,
`condMedioPago`, `condCausa` y `evidenciaGrupoCodigo`, y `reglasDeActo` debe devolver también
las transversales cuando `soloGolden`. El adaptador de `sharedlib` (`requisitos-repo.ts`) ya lo
hace, y `actosConGolden` pasa a leer `goldenSirve` del acto. Requiere `sharedlib` con el
adaptador nuevo.

Medido: Consultor con este paquete da **exactamente** lo mismo que con su copia en 2.471 casos
(353 actos × 3 CCAA × 2 juegos de hechos, más la matriz con ajustes por organización).

## 0.1.0 — 3-oct-2026

El motor de requisitos notariales, sacado de Consultor a `mycolegal-shared` para
que **DocFilling** lo pueda usar sin montar medio Consultor. Es una **copia, no un
traslado**: Consultor sigue con el suyo y se migra después, cuando este paquete
haya demostrado que aguanta un segundo consumidor (D40).

**Lo que el paquete compra, y es la razón de existir: el motor es probable sin
base de datos por primera vez.** La versión de Consultor sólo se podía ejercitar
con un `PrismaClient` real contra el golden sembrado —su `motor.test.ts` son 378
líneas de integración con `console.log`—, así que una regla nueva no se podía
probar sin sembrar la base. Aquí las filas se escriben a mano: **22 pruebas
unitarias, 165 ms.**

Y han pagado de inmediato. Tres creencias mías sobre el contrato eran falsas, y
las tres las cazó el motor al escribir los tests contra él:

- los hechos de ámbito OBJETO **no viven en una bolsa plana**, sino dentro de
  cada objeto (`objetos[].hechos`), que es lo que permite «este piso sí tiene
  cédula y aquel no»;
- el bloque intermedio se llama **`condicionados`**, y
- `condicionada` por tipo de objeto es **relativo al acto**: `VIVIENDA` sólo
  acota porque otra regla del mismo acto pide `INMUEBLE`. Así el tipo base del
  acto se deduce y no hace falta tenerlo en la base de datos.

## Forma del paquete

`src/puerto.ts` declara `RepositorioRequisitos`: cuatro métodos
(`reglasDeActo`, `tiposDeObjeto`, `tiposDeSujeto`, `actosConGolden`) y las filas
campo a campo, incluidos **los dos órdenes que son parte del dato** —los
fundamentos por `orden`, los documentos del grupo de evidencia por `prioridad`—.
Es un puerto **estructural**: cero referencias a `@prisma/client`, así que el
adaptador decide la consulta, los `include` y el filtro de capa.

**`whereCapa` y `whereCapaActo` NO se han portado**, a propósito: devuelven
`Prisma.…WhereInput` y por tanto pertenecen al adaptador. El motor sólo necesita
el booleano, y lo pide con `decidirCapa(repo, acto, capa)`.
