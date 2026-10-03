# @mycolegal-app/text-extract — Changelog

## 0.1.4 — El OCR ya no convierte un documento ilegible en un 500 (2026-10-03)

Type: **patch**

`extraerTexto` documenta que "nunca lanza", pero no cumplía: `/internal/ocr` de
platform traduce CUALQUIER fallo del OCR a un 502 genérico —incluido un 400 de
Vertex por entrada inválida— y `ocrViaPlatform` lo lanzaba. La excepción escapaba
del orquestador y el llamante respondía **500**, saltándose el 422 legible que ya
tenía previsto. En producción (sep-2026) se comió 4 peticiones de Consultor:
3 en `/api/revisor` y 1 en `/api/resoluciones/doc-context`.

- **OCR tolerante** — un fallo del OCR se registra y degrada a
  `{ metodo: 'empty' }`; el llamante decide qué contestar (típicamente un 422).
- **MIME por número mágico** — el navegador manda a veces
  `application/octet-stream`, y Vertex RECHAZA ese valor: era una de las dos
  causas de los 502. Ahora, cuando el MIME declarado no dice nada, se sniffan los
  bytes (PDF, PNG, JPEG, GIF, TIFF, WEBP) y **nunca** se envía octet-stream.
  De paso mejora el enrutado: un PDF declarado octet-stream pasa por su capa de
  texto —gratis— en vez de irse directo al OCR.

Sin cambios de API. Afecta a los llamantes de `extraerTexto`: `mycolegal-consultor`
(Revisor, Biblioteca, doc-context, conectores de fuentes) y `mycolegal-web` (CMS).

## 0.1.0 — Package inicial: extracción de texto consolidada (2026-08-21)

Type: **minor**

Fuente única para la extracción de texto de documentos de la flota MycoLegal.
Consolida procedimientos que vivían dispersos en `@mycolegal-app/sharedlib` y
añade soporte Word.

- **Word (.doc/.docx)** — `word.ts` (`extractWordText`, `esWord`) vía `word-extractor`.
- **PDF (capa de texto)** — `pdf.ts` (`extractText`, `extractPdfText`), movido desde
  `sharedlib/text-extract.ts` (unpdf, sin OCR).
- **OCR** — `ocr-client.ts` (`ocrViaPlatform`), movido desde `sharedlib/ocr-client.ts`.
- **Orquestador** — `extraerTexto(bytes, { mime, fileName, ocr })` en `index.ts`:
  Word → PDF capa-de-texto → (escaneo/imagen) OCR. Devuelve `{ texto, chars, metodo }`.

Consumidores: `mycolegal-consultor` (Revisor), `mycolegal-tramitacion` (inbox).
