// LA CÁSCARA DE UN INFORME IMPRIMIBLE — una, para que no nazcan dos estilos.
//
// POR QUÉ EXISTE
//
// El Revisor de Consultor sirve su informe como **HTML que auto-abre el diálogo
// de impresión** del navegador, y su cabecera dice por qué: «evita depender de
// chromium en el servidor (robusto en Cloud Run)». Es la decisión correcta y se
// conserva.
//
// Lo que no estaba era compartido: el Revisor construye sus ~300 líneas de HTML
// a mano. Al tener Redactor que entregar su propio informe, la alternativa era
// un segundo HTML hecho a mano y dos informes de la misma casa que derivan en la
// franja, en los márgenes y en la tipografía. Así que la cáscara se escribe una
// vez aquí y cada app aporta su CONTENIDO.
//
// ⚠️ Va en `sharedlib` y no en `ui` porque **no es un componente de React**: es
// una función que devuelve una cadena de HTML, para que la sirva una ruta. En
// `ui` obligaría a arrastrar React a un sitio donde no hace falta.
//
// NO se migra el Revisor aquí: su repo lo lleva otra línea de trabajo. Queda
// disponible para cuando lo toquen.

export interface SeccionInforme {
  titulo: string;
  /** Debajo del título, para explicar qué es esta lista. */
  entradilla?: string;
  /** HTML ya compuesto por el llamante. Es su contenido, no se interpreta. */
  cuerpoHtml: string;
}

export interface InformeHtmlArgs {
  /** Va al `<title>` y a la cabecera. */
  titulo: string;
  subtitulo?: string;
  /** Pares que se pintan en la cabecera: «Acto», «Esquema», «Fecha». */
  datos?: { etiqueta: string; valor: string }[];
  /** Avisos destacados arriba: lo que el lector tiene que saber antes de leer. */
  avisos?: string[];
  secciones: SeccionInforme[];
  /** Pie: de dónde sale esto y qué no es. */
  nota?: string;
  /** HTML de la cinta del motor, al pie (`docFillingCintaHtml()`). Se pinta tal
   *  cual: lo genera código, no el usuario. */
  cinta?: string;
}

/** Escapa para HTML. Se exporta porque el llamante compone su propio cuerpo y
 *  necesita el MISMO escapado: dos funciones distintas acaban con una que se
 *  olvida de las comillas. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/**
 * El HTML completo del informe, listo para servir con `text/html`.
 *
 * Trae el botón de imprimir y **no** auto-dispara `window.print()`: el Revisor
 * lo hace, pero un diálogo que salta solo impide leer la pantalla antes de
 * decidir si se imprime, y este informe es sobre todo para leerlo. El botón
 * queda a la vista y se oculta al imprimir.
 */
export function informeHtml(a: InformeHtmlArgs): string {
  const datos = (a.datos ?? [])
    .map((d) => `<div><span class="et">${esc(d.etiqueta)}</span><span class="va">${esc(d.valor)}</span></div>`)
    .join('');
  const avisos = (a.avisos ?? [])
    .map((x) => `<p class="aviso">${esc(x)}</p>`).join('');
  const secciones = a.secciones.map((s) => `
    <section>
      <h2>${esc(s.titulo)}</h2>
      ${s.entradilla ? `<p class="entradilla">${esc(s.entradilla)}</p>` : ''}
      ${s.cuerpoHtml}
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.titulo)}</title>
<style>
  /* A4 con márgenes de documento: lo que se imprime es lo que se archiva. */
  @page{size:A4;margin:18mm 16mm}
  *{box-sizing:border-box}
  body{margin:0;background:#f8fafc;color:#1e293b;
       font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .hoja{max-width:820px;margin:0 auto;background:#fff;padding:0 0 32px}
  /* La franja oro de la identidad de la casa. */
  .franja{height:6px;background:linear-gradient(90deg,#b09a6e,#d8c9a3)}
  header{padding:22px 32px 16px;border-bottom:1px solid #e2e8f0}
  h1{margin:0;font-size:20px;letter-spacing:-.01em}
  .sub{margin:4px 0 0;color:#64748b;font-size:13px}
  .datos{display:flex;flex-wrap:wrap;gap:14px 28px;margin-top:14px;font-size:12px}
  .datos .et{display:block;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-size:10px}
  .datos .va{font-weight:600}
  .aviso{margin:12px 32px 0;padding:9px 12px;border-left:3px solid #d97706;
         background:#fffbeb;color:#92400e;font-size:13px;border-radius:0 4px 4px 0}
  section{padding:20px 32px 0;break-inside:auto}
  h2{margin:0 0 2px;font-size:15px;color:#0f172a}
  .entradilla{margin:0 0 10px;color:#64748b;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid #eef2f6}
  th{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
  tr{break-inside:avoid}
  .pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600}
  .duda{background:#fffbeb;color:#92400e}
  .firme{background:#ecfdf5;color:#065f46}
  .meta{color:#64748b;font-size:11.5px}
  .vacio{color:#94a3b8;font-style:italic;font-size:13px;padding:4px 0 8px}
  footer{margin-top:26px;padding:14px 32px 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11.5px}
  .barra{padding:14px 32px 0}
  button{padding:8px 16px;border-radius:8px;border:1px solid #b09a6e;background:#f6f1e8;
         color:#7a6640;font-weight:600;cursor:pointer;font-size:13px}
  @media print{
    body{background:#fff}
    .no-print{display:none!important}
    .hoja{max-width:none}
  }
</style></head>
<body><div class="hoja">
  <div class="franja"></div>
  <header>
    <h1>${esc(a.titulo)}</h1>
    ${a.subtitulo ? `<p class="sub">${esc(a.subtitulo)}</p>` : ''}
    ${datos ? `<div class="datos">${datos}</div>` : ''}
  </header>
  ${avisos}
  <div class="barra no-print"><button type="button" onclick="window.print()">Descargar / Imprimir PDF</button></div>
  ${secciones}
  ${a.nota ? `<footer>${esc(a.nota)}</footer>` : ''}
  ${a.cinta ?? ''}
</div></body></html>`;
}
