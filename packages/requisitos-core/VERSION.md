# @mycolegal-app/requisitos-core

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
