# PLAN TÉCNICO — Un solo motor de requisitos y evaluación continua por IA

> ✅ **COMPLETADO el 9-oct-2026** → `completed/`. F0–F4 hechas y verificadas: Consultor delega en requisitos-core
> 0.3.3 (`src/lib/requisitos/motor.ts` es una capa fina que reexporta el paquete; equivalencia 2.471/2.471); F2.3 hecha
> (prompts `requisitos.evaluar` y `revisor.evaluacion` con sus tareas de modelo); F4 enganchada al disparador común de
> Redactor y al panel con «Confirmar» (e2e `04-evaluacion-requisitos`). El paso a TEST/PROD lo decide Carles. Fuera
> del plan: `test:motor-requisitos` de Consultor falla en 0501-R08 por datos (va con C6 de
> `consultor/PLAN_TECNICO_REQUISITOS_DOCUMENTALES_V03.md`).
>
> *Estado anterior (8-oct-2026):* F0–F3 hechas; F4 hecha salvo el panel (sesión «mycolegal-auth-ab»).
> PUBLICADOS requisitos-core 0.3.0 y sharedlib 0.12.23 (Carles lo pidió). Nada desplegado. Fases en LOCAL; TEST lo decide Carles.
> Repos: `mycolegal-shared` (requisitos-core, sharedlib), `mycolegal-consultor` (Revisor),
> `mycolegal-redactor`. Dueño: sesión «mycolegal-auth-a3».

## Por qué

Encargo de Carles (8-oct-2026): *«los requisitos (tanto en Revisor como en Redactor) deben ser
continuamente evaluados con la información que la IA recibe (chat + documentos de Redactor, o los
documentos aportados a Revisor). Todos los requisitos que regresa el motor deben ser evaluados por la
IA, y reevaluados cuando el usuario aporta nueva info. Y que Consultor use el motor requisitos-core
compartido.»*

Lo que se midió antes de escribir esto (local + PROD en solo lectura, 370 informes del Revisor de los
últimos 30 días):

1. **Dos motores que ya discrepan.** Consultor usa su copia (`src/lib/requisitos/motor.ts`, 653 líneas);
   Redactor, el paquete `requisitos-core` 0.2.2 (563). La copia tiene lo que el paquete no:
   **reglas transversales** (TODOS / FAMILIA / SUBFAMILIA), ejes **causa** y **medio de pago**, operador
   `INCLUYE`, presunción exacta de tipos, capa por `goldenSirve`. El paquete tiene lo que la copia no:
   **jerarquía de roles** (`VENDEDOR` cumple `DISPONENTE`) y el puerto sin Prisma. Consecuencia hoy:
   Redactor no ve ninguna regla transversal, y el Revisor no hereda roles.
2. **La IA no evalúa requisitos, sólo rellena hechos.** Revisor: una lectura de hechos, el motor
   clasifica y la IA sólo verifica en el texto las menciones FIRMES; los «puede aplicar» y los
   documentos no los mira nadie. Redactor: la IA (MycoBot) sólo contesta cuestiones pendientes; no
   revisa lo contestado ni reevalúa al entrar información.
3. **Hechos que nunca se resuelven.**
   - `ACTO.CAUSA` no tiene `AtributoDef` → no se le pregunta a la IA → **296 reglas de 19 actos**
     siempre «puede aplicar» (77 de 186 en la renuncia 1104).
   - Un hecho que NO EXISTE para un interviniente (régimen de un soltero, estado civil de una
     sociedad, cualquier dato del representante) deja la condición en UNKNOWN: en PROD, 60 de 141
     informes con «falta régimen» lo tenían leído de los casados (51/69 con estado civil).
   - Redactor modela el caso con **un interviniente sintético sin rol**: las 175 condiciones con
     `scopeRolCodigo` no se resuelven nunca aunque se contesten (0501: 9 preguntas; 1103: 8).

## Decisiones

| # | Decisión | Quién |
|---|---|---|
| D1 | **Manda siempre el motor.** La IA resuelve los «puede aplicar» (aplica / no aplica / no se sabe, con evidencia) y evalúa el **cumplimiento** de los que aplican; no toca un firme ni un descartado. Si su lectura los contradice, se anota como discrepancia (señal para curar el golden), sin cambiar el veredicto. | Carles, 8-oct |
| D2 | **Se mide, no se cobra** (como la extracción F5 de Redactor): `withUsage` + liquidación a 0; Admin puede convertirlo en cobrado. En el Revisor va dentro del dictamen. | Carles, 8-oct |
| D3 | Un solo motor: Consultor pasa a `@mycolegal-app/requisitos-core`. Lo que la copia tiene de más se sube al paquete; la capa por-org (overrides, reglas propias) se queda en Consultor encima del paquete. | Carles, 8-oct |
| D4 | El evaluador vive en `requisitos-core` y **no depende de un proveedor de IA**: recibe una función `llm(prompt) → texto` (puerto), como el motor recibe el repositorio. Prompt y modelo los gobierna Admin (tarea + prompt por app). | propuesta |
| D5 | Persistencia: Redactor en `docfilling_tarea.evaluacion` (JSON, nueva columna); Revisor en `contenido.evaluacion` del informe (no se persisten hechos: D4 del plan de registrabilidad). | propuesta |
| D6 | Reevaluación incremental por **huella**: cada evaluación guarda la huella de la información que vio (respuestas + adjuntos + transcripción). Si no cambia, no se llama al modelo. | propuesta |

## Fases

### F0 — Un solo motor (shared + consultor + redactor)
- [x] F0.1 Subir al paquete lo que sólo tiene la copia: transversales (el puerto pide reglas por
      acto **y** por familia/subfamilia/todos), causa y medio de pago, `INCLUYE`, presunción exacta,
      `ambito` y los contadores nuevos del diagnóstico, capa por `goldenSirve`.
- [x] F0.2 Adaptador Prisma de `sharedlib` al día (familia/subfamilia del acto, `goldenSirve`).
- [x] F0.3 Tests del paquete con los casos de la copia de Consultor.
- [x] F0.4 Consultor importa el paquete: borra `lib/requisitos/motor.ts` y `capa.ts`;
      `requisitos-documentales.ts` (overrides) queda encima. Espejo Prisma del Consultor con los
      modelos que pide el adaptador.
- [x] F0.5 **Equivalencia medida**: para cada acto × CCAA, mismo resultado antes/después en
      Consultor (salvo lo que cambia a propósito: herencia de roles).
- [x] F0.6 Publicados `requisitos-core` 0.3.0 + `sharedlib` 0.12.23; Consultor (`ddafdc6`), Redactor
      (`f1c1884`) y Tramitación (`b64651a`, declaraba el motor sin estar en apps.json) suben versión.

Resultado F0 (8-oct): commits shared `2c02dbf`, platform `86ae70f`, consultor `cb339df`, redactor
`7c81c33`. Equivalencia Consultor antes/después **2.471/2.471** (`consultor/scripts/foto-motor-requisitos.ts`).
30 tests del paquete en verde (5 nuevos). Efecto en Redactor: entran las transversales — 0501 pasa de
66 a 161 requisitos y 1104/0201 ya preguntan la causa. Un test de integración del Consultor
(`test:motor-requisitos`, «el TIPO DE SUJETO también acota», 0501-R08) falla **igual con el motor
viejo**: es de datos, no de la unificación.

### F1 — Hechos que hoy no se pueden resolver (catálogo + motor)
- [x] F1.1 La causa la lee la IA del Revisor. **Desviación:** no se da de alta un `AtributoDef`
      (`facts.md` es derivado del golden y la causa vive en una columna de la regla); la lectura de
      hechos usa, para los datos sin definición, la pregunta que compone el motor (rótulo y
      opciones). 1104 → 77 reglas, 0515 → 58, ya decidibles.
- [x] F1.2 Hechos que no existen para un interviniente → NO_APLICA (falso) en vez de UNKNOWN:
      régimen sólo si CASADO; datos personales sólo en persona física; condiciones sin rol no cuentan
      al REPRESENTANTE. Declarado en el catálogo de atributos, no en código.
      **Hecho así:** el tipo sale del catálogo (`sujetoTipoCodigo`/`objetoTipoCodigo` del atributo);
      la dependencia del régimen respecto del estado civil y la lista de datos «de la parte» van
      en dos tablas cortas en `motor.ts` (no hay columna para expresarlas). Quien no tiene el dato
      **no cumple la condición con ningún operador** (la primera versión hacía verdadero un NE y la
      foto lo cazó en GLOBAL-R50). Efecto medido: sin hechos, 0 cambios; con intervinientes,
      702 requisitos pasan de en duda a descartados y ninguno a firme.
- [x] F1.3 Preguntas de TIPO que no se pueden contestar: las opciones de `SUJETO.TIPO` /
      `OBJETO.TIPO` son sólo los tipos que piden las reglas en duda. Caso real (8-oct, sesión
      «Redactor - sociedades»): 1936 (aumento de capital) de una SL pregunta «Tipo de
      interviniente» con opciones `["SA"]` — una SL no tiene respuesta. Las opciones deben ser
      los tipos reales del catálogo (con su jerarquía) y el motor descartar por is-a.
      **Hecho (0.3.1):** opciones = tipos pedidos + «Ninguno de estos» (`NINGUNO_DE_ESTOS`), decisión de
      Carles; la 0.3.0 ofrecía los hermanos, que llenaban el panel de opciones que ninguna regla pide.
- [x] F1.4 (para F2) `condicionesTexto` en cada requisito: las condiciones en palabras con el
      identificador del dato entre corchetes.

### F2 — Evaluador IA compartido (requisitos-core)
- [x] F2.1 `evaluarRequisitos({ resultado del motor, contexto, llm })` → por requisito:
      `{ aplica: SI|NO|NS (sólo en «puede aplicar»), cumplido: SI|NO|NS, evidencia, fuente, confianza }`.
      Lotes de ~40, salida JSON validada; lo que no cuadra se descarta (como `normalizarExtraccion`).
- [x] F2.2 Huella del contexto (D6) y reevaluación sólo si cambia.
      **Hecho (8-oct)** en `requisitos-core/src/evaluador.ts`: `evaluarCaso` = motor → IA (datos +
      cumplimiento) → motor con los datos → IA sobre lo nuevo (2 vueltas máx.). La IA devuelve
      DATOS con cita (no veredictos de aplicabilidad: D1); toda cita se verifica contra la fuente
      y la que no está se tira; un SI sin prueba baja a NS; los datos de la IA no pisan los
      conocidos y los de confianza baja no entran. Prompt aprobado por Carles el 8-oct
      (`PROMPT_EVALUAR_REQUISITOS`). 43 tests en verde (6 del evaluador, con modelo de mentira).
- [x] F2.3 Prompt `requisitos.evaluar` y tarea de modelo en Admin. *(Redactor `src/lib/ai.ts`; Revisor `revisor.evaluacion`.)*

### F3 — Revisor
- [x] F3.1 El análisis evalúa TODOS los requisitos del motor con la escritura + antecedentes:
      documentos y checklist salen del evaluador; «puede aplicar» resuelto con evidencia.
- [x] F3.2 Pantalla y PDF: veredicto IA, evidencia y discrepancias marcadas.

Resultado F3 (8-oct, consultor `4ccf900`, `cba5eba`): compraventa real 0501 → en duda 61 → 41,
descartados 62 → 81, 84 evaluados (20 cumplen, 14 no, 50 NS), 31 s. Requiere el vocabulario cerrado
(la IA inventaba roles/tipos) y que un tipo más concreto refine al conocido (shared `cf2443f`).

### F4 — Redactor
- [x] F4.1 Hechos con varios intervinientes CON ROL (no uno sintético) desde el chat y los documentos.
- [x] F4.2 Evaluación persistida por tarea; se dispara tras cada turno del chat, cada adjunto y cada
      respuesta del panel (en segundo plano, con huella).
- [x] F4.3 Panel y lista de validación muestran el veredicto IA (y lo proponen como casilla).

Estado F4 (8-oct): HECHA y probada de punta a punta en LOCAL (e2e `04-evaluacion-requisitos`):
aportar un documento → disparador → evaluación → propuesta en el panel → Confirmar → lista. 0.3.1
añade la lectura de datos aparte (pendientes 70 → 41 en el trabajo del e2e). Historia: reaplicado en `f1c1884` tras publicar; falta engancharlo al disparador común y
el panel (los dos de la sesión «mycolegal-auth-ab», avisada). Historia: hecho y probado con modelo real (trabajo 0501 sólo chat: 57 s, pendientes
16 → 13), commiteado en Redactor `c1764a1` y **REVERTIDO** en `c9c8003` porque Redactor no compilaba
contra los paquetes publicados y otra sesión tenía que reconstruirlo. Pendiente tras publicar
requisitos-core 0.3.x + sharedlib: `git revert c9c8003`; enganchar `requisitos: evaluarRequisitosTarea`
en `TRABAJOS` de `expediente-cambiado.ts` (disparador común, sesión «mycolegal-auth-ab»); el panel
(de esa sesión) pinta la casilla propuesta con su prueba y «Confirmar». F4.1 se resolvió con la
opción `rolComodin` del motor (shared `e1ecdd7`) y los datos de la IA, que traen su rol.

## Fuera de alcance
- Notaría (expedientes) consume el motor por `api/inter/requisitos-documentales/expediente` del
  Consultor: hereda F0 y F1 sin cambios propios; la evaluación IA en Notaría, si se quiere, es otro plan.
