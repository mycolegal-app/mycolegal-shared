# @mycolegal-app/text-extract

Extracción de texto de documentos para la flota MycoLegal. Fuente única: Word,
PDF (capa de texto) y OCR (vía el servicio de platform). Hermano de
`@mycolegal-app/ui` y `@mycolegal-app/sharedlib` en el monorepo `mycolegal-shared`.

## Uso

```ts
import { extraerTexto } from '@mycolegal-app/text-extract';

const { texto, metodo } = await extraerTexto(bytes, {
  mime,          // MIME del documento (opcional)
  fileName,      // nombre (para decidir por extensión si el MIME es ambiguo)
  ocr: {         // opcional: fallback OCR para PDF escaneado / imágenes
    platformUrl: PLATFORM_INTERNAL_URL,
    serviceKey: APPS_REGISTER_SECRET,
  },
});
// metodo ∈ 'xlsx' | 'word' | 'pdf-text-layer' | 'ocr' | 'empty'
// recortado / avisos (0.2.0): si el texto no cabía o hubo celdas sin valor
```

Formatos:
- **Excel** `.xlsx` / `.xlsm` → texto etiquetado por letra de columna (`Fila N: A=… | B=…`).
  Una celda u hoja ilegible no tumba el libro; si no cabe (400.000 caracteres por defecto) se
  recorta por filas y se avisa en el texto y en `avisos`. `.xls` antiguo → aviso de guardarlo como .xlsx.
- **Word** `.doc` / `.docx` → texto embebido (sin OCR ni coste IA).
- **PDF** → capa de texto (`unpdf`); si es un escaneo sin texto y se pasa `ocr`,
  cae a OCR de platform (visión de Gemini).
- **Imagen / otros** → OCR si se provee config; si no, `metodo: 'empty'`.

Piezas de bajo nivel exportadas: `extractWordText`, `esWord`, `extractText`
(PDF), `extractPdfText`, `ocrViaPlatform`.

## Publicación

Se publica a GitHub Packages desde el monorepo (`tools/publish-package.sh
text-extract`), igual que `ui`/`sharedlib`. Se distribuye como **TS fuente**
(no build); los consumidores lo compilan con su propio bundler.
