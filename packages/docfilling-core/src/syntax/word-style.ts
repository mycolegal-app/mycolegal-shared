// `{{WORD_STYLE:Nombre}}` — el estilo de párrafo de la plantilla a aplicar.
//
// QUÉ RESUELVE
//
// Markdown no sabe decir «esta línea es la fórmula notarial». La biblioteca lo
// venía diciendo con HTML crudo, y de tres maneras distintas para la MISMA cosa
// (medido el 3-oct-2026): `<p align="center"><b>OTORGAN</b></p>`,
// `<p align="center"><b>ME REQUIEREN</b></p>` y
// `<p style="text-align: center;"><strong>OTORGA|OTORGAN</strong></p>`.
//
// POR QUÉ UN ESTILO Y NO UN «CENTRADO»
//
// Porque centrar es presentación, y meterla en el markdown va contra D4 y D6 —el
// markdown lleva el contenido, el `.docx` de referencia el aspecto—. Un ESTILO
// es justo la indirección entre los dos: el documento dice qué ES el párrafo, y
// la plantilla de la notaría decide cómo se ve. Que hoy la fórmula vaya centrada
// y en negrita es una decisión de su plantilla, no del documento.
//
// POR QUÉ GENÉRICO Y NO UNA PALABRA POR ROL
//
// Decisión de Carles, 3-oct-2026: una sola directiva cubre la fórmula notarial y
// cualquier rol que venga después —bloque de firma, cita, encabezado de anexo—
// sin volver a tocar el lenguaje cada vez.
//
// LA CONSECUENCIA, QUE HAY QUE TENER PRESENTE
//
// Siendo genérico, la fusión **no puede inventar un respaldo visual**: no sabe
// qué pretende el estilo. Si la plantilla no lo define, el párrafo sale sin
// estilo —plano— y la fusión lo reporta. Por eso la validación de la plantilla
// (F2.4) pasa a ser portante: comprueba la plantilla contra la lista de estilos
// que el catálogo usa de verdad, y esa lista se saca del propia biblioteca con
// `estilosUsados()`.
//
// DÓNDE SE RESUELVE
//
// La directiva **sobrevive intacta a `compose`** —como `{{PAGEBREAK}}`— y es
// la fusión quien la consume y emite `<w:pStyle w:val="…"/>`. Va al PRINCIPIO
// del párrafo al que afecta, no en una línea aparte: así no depende de la
// posición ni hay que adivinar a qué párrafo se refiere.
//
//     {{WORD_STYLE:Formula notarial}}**{{AUTO:OTORGA|OTORGAN}}**

/** La palabra clave, tal como se escribe. */
export const WORD_STYLE = 'WORD_STYLE';

/** Captura el nombre del estilo. Se admite cualquier cosa menos `}`: los
 *  nombres de estilo de Word llevan espacios, acentos y hasta paréntesis
 *  («Fórmula notarial», «Título 1»). */
export const WORD_STYLE_PATTERN = /\{\{\s*WORD_STYLE\s*:\s*([^}]+?)\s*\}\}/i;

/** La misma, global, para recorrer un texto. */
export const WORD_STYLE_PATTERN_G = new RegExp(WORD_STYLE_PATTERN.source, 'gi');

/** ¿El cuerpo de un `{{...}}` es un `WORD_STYLE`? Recibe el interior sin llaves. */
export function esWordStyle(cuerpo: string): boolean {
  return /^WORD_STYLE\s*:/i.test(cuerpo.trim());
}

/** El nombre del estilo que declara el cuerpo de la directiva, o `null`. */
export function nombreDeEstilo(cuerpo: string): string | null {
  const m = /^WORD_STYLE\s*:\s*(.+)$/i.exec(cuerpo.trim());
  const n = m?.[1].trim();
  return n ? n : null;
}

/** Construye la directiva. */
export const directivaWordStyle = (nombre: string) => `{{${WORD_STYLE}:${nombre}}}`;

/**
 * Los estilos que un texto declara, sin repetidos y en orden de aparición.
 *
 * Es lo que permite validar una plantilla contra lo que el catálogo necesita de
 * verdad, en vez de contra una lista escrita a mano que se queda vieja.
 */
export function estilosUsados(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(WORD_STYLE_PATTERN_G)) {
    const n = m[1].trim();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}
