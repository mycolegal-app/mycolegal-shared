# @mycolegal-app/text-extract — Changelog

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
