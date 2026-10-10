# XSD del Índice Único Informatizado (IUI) — copia de trabajo

**Copia DERIVADA.** La fuente es el paquete del CTN que vive en el Drive compartido:
`DocFilling/knowledge-base/CTN 2026/xsd/documentos_notariales_xsd/` (7 ficheros, namespace
`http://inti.notariado.org/XML/IU2007`, versión **IU2007**). Copiada el **9-oct-2026** sin tocar un byte.

Fechas de los ficheros en origen: `documento.xsd` y `sujeto.xsd` de **5-feb-2026**; los otros cinco
(`comun`, `direccion`, `documentos_notariales`, `objeto`, `operacion`) de **25-sep-2024**.

Está aquí, dentro del catálogo universal, para que el build sea reproducible: `iui/indice_xsd.py` recorre
estos ficheros y emite `iui/rutas.json` (cada ruta con su tipo, enumeración, cardinalidad y posición en la
secuencia), que usan `validate.py` (rutas y códigos `iui` de hechos y datos) y el serializador del XML del IUI.
El importador (`platform/scripts/importar-catalogo-universal.sh`) trae `iui/` al repo de Consultor
(`content/req-docs/iui/`). Plan: `mycolegal-redactor/PLAN_TECNICO_REQ_CATALOGO_IUI.md` F0.1–F0.2.

Los manuales (`RU_SIGNO_EE_MU_01.02_v.1.0` y `RU_SIGNO_EE_ANEXO1_AJ_v.6.0`) se quedan en `CTN 2026/`.

**Si el CTN publica una versión nueva:** se sustituye aquí la copia entera, se actualizan esta nota y la tabla
de huellas, se regenera `rutas.json` y se mira qué rutas y códigos `iui` del catálogo deja de aceptar `validate.py`.

| SHA-256 | Fichero |
|---|---|
| `2ff057b93fca5f211334d75fe519494c207ab113227592cda77aea16216c6a71` | `comun.xsd` |
| `3ab650724185d45e42b8d8ed7371d324334c73b49acb2451efd7e5104796fa75` | `direccion.xsd` |
| `482fe786d3b297a5d33f1e942800cf751c9c7f2165d4d41f1b06573f69481c99` | `documento.xsd` |
| `3ff2e4491ca30057cdad80cb14d117c5c266fe0adf5daca781f31b592813f437` | `documentos_notariales.xsd` |
| `f01564ccb2becd77bbd4c07cd249315f64228fe45165d9c8f0910dc702f10c17` | `objeto.xsd` |
| `d4ac9e876dbc598130345b4c56d5b86355ad5fa746ba295fec350c87a56c7cbc` | `operacion.xsd` |
| `48de36ad38aaf096dd4a9850b78568e176fb786ab38f50edc3b17d40401b0507` | `sujeto.xsd` |
