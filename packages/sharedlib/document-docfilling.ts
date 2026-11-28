// @mycolegal-app/sharedlib/document-docfilling — plantillas de documento en sintaxis DocFilling
// (LegiFirma y Pólizas, PLAN_TECNICO_PLANTILLAS_DOCFILLING_APPS).
//
// QUÉ HACE
//
//   · Compone la plantilla con el motor (`docfilling-core`): campos, IF/ELSE/ENDIF, formatos `#…`,
//     FOR EACH, `{{ABORT: …}}`, y deja pasar `{{WORD_STYLE:X}}`/`{{PAGEBREAK}}` para la fusión.
//   · Valida lo que la notaría guarda con el motor DE VERDAD, más lo que el motor no puede saber:
//     qué campos da la app y qué directivas no significan nada aquí.
//   · Lee los DATOS DE LA NOTARÍA de donde los escribe Config (la `configuracion` COMÚN y el
//     notario firmante de `user_roles`), con los mismos nombres `SYSTEM:` que Redactor.
//   · Fusiona el markdown con el Word de membrete de la notaría (o con la carta genérica) en
//     platform, y SÓLO produce `.docx` (D6 del plan: no hay PDF).
//
// QUÉ NO HACE
//
//   · No guarda nada: la tabla `document_templates` y la de membretes las llevan las rutas de cada app.
//   · No es Redactor: no hay `DECLARE`, ni `INCLUDE`, ni preguntas, ni biblioteca (D1).
//
// `@mycolegal-app/docfilling-core` es peerDependency: sólo lo instalan las apps que importan este
// subpath. `@prisma/client` igual que en el resto de sharedlib: resuelve al cliente de la app.

import { notariosFirmantes, notarioFirmantePorId } from './server/notarios-firmantes';
import {
  composeWithDiagnostics,
  validateText,
  parseFields,
  FieldType,
  type Diagnostic,
} from '@mycolegal-app/docfilling-core';
import { escapeMarkdown } from './document-render';
import { DOCX_CONTENT_TYPE } from './docx-client';
import { CARTA_GENERICA_DOCX_BASE64 } from './carta-generica';

export { DOCX_CONTENT_TYPE };

// =============================================================================
// Campos
// =============================================================================

/**
 * Un campo que la APP pone en la plantilla (los de la notaría van aparte, `SYSTEM:`).
 *
 * `tipo` decide el escape:
 *   · `dato`     — lo escribe una persona (un nombre, un concepto): se escapa para markdown, para que
 *                  un `*` o un `<` en el nombre de un cliente no cambie el formato del documento.
 *   · `control`  — un valor cerrado que pone el código y que gobierna un IF (`TIPO_DOC = POLIZA`):
 *                  va tal cual, porque escaparlo cambiaría la comparación.
 *   · `lista`    — un FOR EACH; sus `subcampos` son los `ITEM.X` y se escapan como `dato`.
 */
export interface CampoPlantilla {
  key: string;
  label: string;
  example: string;
  tipo?: 'dato' | 'control' | 'lista';
  /** Sólo en `lista`: los campos de cada elemento (`{{ITEM.NOMBRE}}`). */
  subcampos?: { key: string; label: string; example: string }[];
  /** Sólo en `lista`: los elementos de ejemplo para la vista previa. */
  ejemploLista?: Record<string, string>[];
  /** Sólo en `control`: los valores posibles, para el editor. */
  valores?: string[];
}

/** Un dato de la notaría que la plantilla escribe como `{{SYSTEM:CLAVE}}`. */
export interface CampoNotaria {
  key: string;
  label: string;
  /** Dónde lo rellena la notaría, para el mensaje cuando falta. */
  dondeSeRellena: string;
}

/**
 * Los datos de la notaría. Mismos nombres que los predefinidos de Redactor (`NOMBRE_NOTARIO`,
 * `COLEGIO_NOTARIAL`, `DIRECCION_NOTARIA`, `POBLACION_NOTARIO`, `MUNICIPIO_NOTARIA`), para que una
 * notaría escriba lo mismo en las tres apps; y los que el membrete necesita y la biblioteca no usaba.
 */
export const CAMPOS_NOTARIA: CampoNotaria[] = [
  { key: 'NOMBRE_NOTARIA', label: 'Nombre comercial de la notaría', dondeSeRellena: 'Config › Organización (nombre comercial)' },
  { key: 'DIRECCION_NOTARIA', label: 'Dirección del despacho', dondeSeRellena: 'Config › Organización (dirección)' },
  { key: 'LOCALIDAD_NOTARIA', label: 'Código postal y población', dondeSeRellena: 'Config › Organización (ciudad)' },
  { key: 'MUNICIPIO_NOTARIA', label: 'Población (sin código postal)', dondeSeRellena: 'Config › Organización (ciudad)' },
  { key: 'TELEFONO_NOTARIA', label: 'Teléfono', dondeSeRellena: 'Config › Organización (teléfono)' },
  { key: 'EMAIL_NOTARIA', label: 'Correo de contacto', dondeSeRellena: 'Config › Organización (correo de contacto)' },
  { key: 'CIF_NOTARIA', label: 'NIF/CIF', dondeSeRellena: 'Config › Organización (CIF)' },
  { key: 'NOMBRE_NOTARIO', label: 'Notario firmante', dondeSeRellena: 'Config › Notarios (marcar el notario firmante)' },
  { key: 'COLEGIO_NOTARIAL', label: 'Colegio notarial (territorio)', dondeSeRellena: 'Config › Organización (colegio notarial)' },
  { key: 'POBLACION_NOTARIO', label: 'Residencia del notario', dondeSeRellena: 'Config › Organización (ciudad)' },
];

const CLAVES_NOTARIA = new Set(CAMPOS_NOTARIA.map((c) => c.key));

// =============================================================================
// Datos de la notaría
// =============================================================================

/** Lo mínimo del cliente Prisma de la app que hace falta: SQL con parámetros. Así no hay que espejar
 *  `configuracion`, `notarios` ni `notario_poblaciones` en apps que no los modelan (LegiFirma tiene su
 *  propia tabla `legifirma_configuracion` con el mismo nombre de modelo). */
export interface DbSql {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe?(query: string, ...values: unknown[]): Promise<number>;
}

/** «Ilustre Colegio Notarial de Cataluña» → «Cataluña»: la plantilla ya escribe «Colegio de». Igual que
 *  `territorioDeColegio` de Redactor (#1074). */
export function territorioDeColegio(colegio: string): string {
  return (
    colegio
      .replace(/^\s*(il[·.]?lustre\s+|ilustre\s+)?(colegio|col[·.]?legi)\s+notarial\s+(del\s+|de\s+|d['’]\s*)/i, '')
      .trim() || colegio.trim()
  );
}

/** «08202 Sabadell (Barcelona)» → «Sabadell». */
export function municipioDe(localidad: string): string {
  return localidad
    .replace(/^\s*\d{4,5}\s*[-–]?\s*/, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .split(',')[0]
    .trim();
}

export interface DatosNotaria {
  /** Clave `SYSTEM:` → valor ('' si no consta). */
  valores: Record<string, string>;
  /** Id de `user_roles` del notario firmante resuelto, o null. */
  notarioFirmanteId: string | null;
  /** Si hay varios notarios firmantes marcados y el documento no dice cuál. */
  variosFirmantes: boolean;
}

/**
 * Los datos de la notaría tal como los deja Config:
 *   · `configuracion` (la COMÚN, la que escribe Config › Organización por `notaria/api/inter/org-config`):
 *     `org.nombre_comercial`, `org.direccion`, `org.telefono`, `org.email_contacto`, `org.cif`,
 *     `notaria_ciudad`, `notaria_notario_colegio`;
 *   · `organizations.name` y `organizations.colegio` como respaldo;
 *   · el notario firmante de `user_roles` (Config › Notarios), con su nombre del censo si está vinculado.
 *
 * `notarioFirmanteId`: el que diga el documento (la actuación, la póliza). Si no dice ninguno, el
 * único firmante según la regla común (server/notarios-firmantes); con varios, ninguno (decide la persona).
 */
export async function datosNotaria(
  db: DbSql,
  orgId: string,
  opts: { notarioFirmanteId?: string | null } = {},
): Promise<DatosNotaria> {
  const [cfg, org, firmantes] = await Promise.all([
    db.$queryRawUnsafe<{ clave: string; valor: string }[]>(
      `SELECT clave, valor FROM configuracion WHERE "orgId" = $1 AND clave = ANY($2::text[])`,
      orgId,
      ['org.nombre_comercial', 'org.direccion', 'org.telefono', 'org.email_contacto', 'org.cif', 'notaria_ciudad', 'notaria_notario_colegio'],
    ),
    db.$queryRawUnsafe<{ name: string | null; colegio: string | null }[]>(
      `SELECT name, colegio FROM organizations WHERE id = $1`,
      orgId,
    ),
    // La regla de quién firma es la común a todas las apps (server/notarios-firmantes).
    opts.notarioFirmanteId
      ? notarioFirmantePorId(db, orgId, opts.notarioFirmanteId).then((n) => (n ? [n] : []))
      : notariosFirmantes(db, orgId),
  ]);

  const c = new Map(cfg.map((f) => [f.clave, (f.valor ?? '').trim()]));
  const o = org[0] ?? { name: null, colegio: null };
  const firmante = firmantes.length === 1 ? firmantes[0] : null;
  const firmanteId = firmante?.id ?? null;
  const notario = { nombre: firmante?.nombre ?? null, poblacion: firmante?.poblacion ?? null };

  const localidad = c.get('notaria_ciudad') ?? '';
  const municipio = localidad ? municipioDe(localidad) : '';
  const colegio = c.get('notaria_notario_colegio') || o.colegio?.trim() || '';

  return {
    valores: {
      NOMBRE_NOTARIA: c.get('org.nombre_comercial') || o.name?.trim() || '',
      DIRECCION_NOTARIA: c.get('org.direccion') ?? '',
      LOCALIDAD_NOTARIA: localidad,
      MUNICIPIO_NOTARIA: municipio,
      TELEFONO_NOTARIA: c.get('org.telefono') ?? '',
      EMAIL_NOTARIA: c.get('org.email_contacto') ?? '',
      CIF_NOTARIA: c.get('org.cif') ?? '',
      NOMBRE_NOTARIO: notario.nombre ?? '',
      COLEGIO_NOTARIAL: colegio ? territorioDeColegio(colegio) : '',
      POBLACION_NOTARIO: notario.poblacion || municipio,
    },
    notarioFirmanteId: firmanteId,
    variosFirmantes: !opts.notarioFirmanteId && firmantes.length > 1,
  };
}

// =============================================================================
// Componer
// =============================================================================

/** Las claves `SYSTEM:` que usa una plantilla. */
export function camposNotariaUsados(plantilla: string): string[] {
  const usados = new Set<string>();
  for (const f of parseFields(plantilla)) {
    if (f.fieldType === FieldType.SYSTEM && CLAVES_NOTARIA.has(f.name)) usados.add(f.name);
  }
  return [...usados];
}

/** Los datos de la notaría que aparecen en la condición de algún IF (con o sin `SYSTEM:`). */
export function camposNotariaEnCondiciones(plantilla: string): Set<string> {
  const s = new Set<string>();
  for (const f of parseFields(plantilla)) {
    if (f.fieldType !== FieldType.CONDITIONAL) continue;
    for (const m of f.content.matchAll(/(?:SYSTEM:)?([A-Za-z_]\w*)/g)) if (CLAVES_NOTARIA.has(m[1])) s.add(m[1]);
  }
  return s;
}

export interface DatoQueFalta {
  key: string;
  label: string;
  dondeSeRellena: string;
}

/**
 * Los datos de la notaría que la plantilla USA y están vacíos. Si hay alguno, el documento no se
 * genera: una notaría no puede entregar «Yo, , Notario» (10.2 del plan de lanzamiento de Pólizas).
 */
export function datosNotariaQueFaltan(plantilla: string, datos: DatosNotaria): DatoQueFalta[] {
  // Un dato por el que la plantilla PREGUNTA en un IF (`{{IF SYSTEM:TELEFONO_NOTARIA}}Tel.: …{{ENDIF}}`) es
  // opcional: el autor ya ha previsto que falte. Sólo bloquea lo que se escribe sin condición.
  const opcionales = camposNotariaEnCondiciones(plantilla);
  return camposNotariaUsados(plantilla)
    .filter((k) => !opcionales.has(k))
    .filter((k) => !datos.valores[k]?.trim())
    .map((k) => {
      const c = CAMPOS_NOTARIA.find((x) => x.key === k)!;
      const donde =
        k === 'NOMBRE_NOTARIO' && datos.variosFirmantes
          ? 'Hay varios notarios firmantes: elige quién firma este documento'
          : c.dondeSeRellena;
      return { key: k, label: c.label, dondeSeRellena: donde };
    });
}

function escaparLista(v: unknown): Record<string, string>[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) =>
    Object.fromEntries(
      Object.entries((item ?? {}) as Record<string, unknown>).map(([k, x]) => [k, x == null ? '' : escapeMarkdown(String(x))]),
    ),
  );
}

export interface Composicion {
  /** Markdown final, listo para la fusión (`{{WORD_STYLE}}`/`{{PAGEBREAK}}` intactos). */
  markdown: string;
  /** Los `{{ABORT: …}}` que se dispararon: si hay alguno, NO se entrega el documento. */
  bloqueos: string[];
  avisos: string[];
}

/**
 * Plantilla + valores de la app + datos de la notaría → markdown.
 *
 * Un campo de la app sin valor sale VACÍO (D4), no «[NO DISPONIBLE]»: se pasan todos los del catálogo,
 * aunque sea con ''. Los de dato se escapan para markdown; los de control, no (ver `CampoPlantilla`).
 */
export function componerPlantilla(opts: {
  plantilla: string;
  campos: CampoPlantilla[];
  valores: Record<string, unknown>;
  notaria: DatosNotaria;
  /** `es`, `ca`… (formatos de fecha e importe, `#words`). */
  locale?: string;
}): Composicion {
  const { plantilla, campos, valores, notaria, locale = 'es' } = opts;
  // Un campo con formato (`{{FECHA#date_long}}`, `{{IMPORTE#amount}}`) tiene que llegar SIN escapar: el
  // escape de `2026-11-27` deja `2026\-11\-27`, el motor ya no lo lee como fecha y lo imprime tal cual
  // (medido el 27-nov en el test). Son números y fechas que pone la app, no texto de una persona.
  const conFormato = new Set(
    [...plantilla.matchAll(/\{\{\s*(?:SYSTEM:)?([A-Za-z0-9_]+)\s*#/g)].map((m) => m[1]),
  );
  const escapar = (k: string, x: string) => (conFormato.has(k) ? x : escapeMarkdown(x));
  const v: Record<string, unknown> = {};
  for (const c of campos) {
    const x = valores[c.key];
    if (c.tipo === 'lista') v[c.key] = escaparLista(x);
    else if (c.tipo === 'control') v[c.key] = x == null ? '' : String(x);
    else v[c.key] = x == null ? '' : escapar(c.key, String(x));
  }
  // Los de la notaría: `SYSTEM:X` resuelve el campo `X`. También escapados: los teclea una persona en Config.
  for (const [k, x] of Object.entries(notaria.valores)) v[k] = escapar(k, x);

  const r = composeWithDiagnostics(plantilla, v, locale);
  return {
    markdown: r.text.replace(/\n{3,}/g, '\n\n').trim() + '\n',
    bloqueos: r.bloqueos,
    avisos: r.warnings.map((w) => w.message),
  };
}

/** Los valores de ejemplo del catálogo, para la vista previa. */
export function valoresDeEjemplo(campos: CampoPlantilla[]): Record<string, unknown> {
  return Object.fromEntries(
    campos.map((c) => [c.key, c.tipo === 'lista' ? c.ejemploLista ?? [] : c.example]),
  );
}

/** Markdown final → texto plano (para copiar en SIGNO/SIC, #127). */
export function textoPlano(markdown: string): string {
  // Los caracteres escapados (los de los valores: `\*`, `\_`) se apartan ANTES de quitar las marcas, para
  // que `\*x\*` no se lea como cursiva; se devuelven al final, ya sin la contrabarra.
  const apartados: string[] = [];
  return markdown
    .replace(/\\([\\`*_{}[\]()#+\-!|])/g, (_m, c: string) => `\u0000${apartados.push(c) - 1}\u0000`)
    .replace(/\{\{\s*WORD_STYLE\s*:[^}]*\}\}/gi, '')
    .replace(/\{\{\s*PAGEBREAK\s*\}\}/gi, '\n')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '- ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => apartados[Number(i)])
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =============================================================================
// Validar
// =============================================================================

/** Lo que no significa nada en una plantilla de documento de la app (D1). */
const DIRECTIVAS_PROHIBIDAS = new Set<FieldType>([
  FieldType.INCLUDE,
  FieldType.EXIT_INCLUDE,
  FieldType.DECLARE,
  FieldType.DECLARE_ARRAY,
  FieldType.INPUT,
  FieldType.INPUT_FINAL,
  FieldType.AUTO,
  FieldType.DOCUBOT,
  FieldType.MAP_IUI,
  FieldType.DEPENDENCY,
  FieldType.SET,
  FieldType.LANG,
  FieldType.ALLOW_UNDECLARED,
  FieldType.TAGS,
  FieldType.SUMMARY,
]);

/** Avisos del motor que aquí no aplican: los campos los pone la app y nunca se declaran. */
const AVISOS_QUE_NO_APLICAN = new Set(['W056', 'W071']);

export interface DiagnosticoPlantilla {
  line: number;
  col: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  fix?: Diagnostic['fix'];
}

function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function parecido(nombre: string, candidatos: string[]): string | null {
  let mejor: string | null = null;
  let dMin = 3;
  for (const c of candidatos) {
    const d = distancia(nombre, c);
    if (d < dMin) {
      dMin = d;
      mejor = c;
    }
  }
  return mejor;
}

/**
 * Valida lo que la notaría quiere guardar. Bloquean los `error`; los `warning` se enseñan.
 *
 * Además del motor: campo que la app no da, `SYSTEM:` que no existe, `ITEM.X` que la lista no tiene,
 * y directivas de Redactor que aquí no significan nada.
 */
export function validarPlantillaDocumento(texto: string, campos: CampoPlantilla[]): DiagnosticoPlantilla[] {
  const out: DiagnosticoPlantilla[] = [];
  for (const d of validateText(texto).diagnostics) {
    if (AVISOS_QUE_NO_APLICAN.has(d.code)) continue;
    out.push({ line: d.line, col: d.col, severity: d.severity === 'error' ? 'error' : 'warning', code: d.code, message: d.message, fix: d.fix });
  }

  const deApp = new Map(campos.map((c) => [c.key, c]));
  const nombresApp = [...deApp.keys()];
  const nombresNotaria = [...CLAVES_NOTARIA];
  // Las variables de bucle abiertas, para saber de qué lista es cada `ITEM.X`.
  const bucles: { variable: string; lista: string }[] = [];

  for (const f of parseFields(texto)) {
    const at = { line: f.line, col: f.col };
    if (DIRECTIVAS_PROHIBIDAS.has(f.fieldType)) {
      out.push({ ...at, severity: 'error', code: 'P001', message: `«${f.raw}» no se puede usar en una plantilla de documento: aquí sólo hay campos, condiciones, listas, formatos y estilos.` });
      continue;
    }
    if (f.fieldType === FieldType.FOR_EACH) {
      const m = /FOR\s+EACH\s+(\w+)\s+IN\s+([\w.]+)/i.exec(f.content);
      if (m) {
        bucles.push({ variable: m[1], lista: m[2] });
        const lista = deApp.get(m[2]);
        if (!lista || lista.tipo !== 'lista') {
          const sug = parecido(m[2], campos.filter((c) => c.tipo === 'lista').map((c) => c.key));
          out.push({ ...at, severity: 'error', code: 'P002', message: `«${m[2]}» no es una lista de este documento.${sug ? ` ¿Quisiste decir ${sug}?` : ''}` });
        }
      }
      continue;
    }
    if (f.fieldType === FieldType.END_FOR) {
      bucles.pop();
      continue;
    }
    if (f.fieldType === FieldType.SYSTEM) {
      if (!CLAVES_NOTARIA.has(f.name)) {
        const sug = parecido(f.name, nombresNotaria);
        out.push({ ...at, severity: 'error', code: 'P003', message: `«SYSTEM:${f.name}» no es un dato de la notaría.${sug ? ` ¿Quisiste decir SYSTEM:${sug}?` : ''}` });
      }
      continue;
    }
    // Campos simples y los de las condiciones.
    // En una condición, quitar antes los literales entre comillas ('POLIZA') y resolver los `SYSTEM:X`.
    const condicion = f.fieldType === FieldType.CONDITIONAL ? f.content.replace(/'[^']*'|"[^"]*"/g, ' ') : '';
    if (condicion) {
      for (const m of condicion.matchAll(/SYSTEM:([A-Za-z_]\w*)/g)) {
        if (!CLAVES_NOTARIA.has(m[1])) {
          const sug = parecido(m[1], nombresNotaria);
          out.push({ ...at, severity: 'error', code: 'P003', message: `«SYSTEM:${m[1]}» no es un dato de la notaría.${sug ? ` ¿Quisiste decir SYSTEM:${sug}?` : ''}` });
        }
      }
    }
    const nombres =
      f.fieldType === FieldType.CONDITIONAL
        ? (condicion.replace(/SYSTEM:[A-Za-z_]\w*/g, ' ').match(/[A-Za-z_][\w.]*/g) ?? []).filter(
            (t) => !/^(IF|ELSE|ENDIF|END|AND|OR|NOT|TRUE|FALSE)$/i.test(t),
          )
        : f.fieldType === FieldType.EXTRACTED
          ? [f.name]
          : [];
    for (const n of nombres) {
      if (/^SYSTEM$/i.test(n)) continue;
      // En una condición, un dato de la notaría sin prefijo también vale (el motor lo resuelve igual).
      if (f.fieldType === FieldType.CONDITIONAL && CLAVES_NOTARIA.has(n)) continue;
      const [base, sub] = n.split('.');
      if (sub) {
        const b = bucles.find((x) => x.variable === base);
        if (!b) {
          out.push({ ...at, severity: 'error', code: 'P004', message: `«${n}» sólo se puede usar dentro de un FOR EACH ${base} IN …` });
          continue;
        }
        const lista = deApp.get(b.lista);
        const subs = lista?.subcampos?.map((s) => s.key) ?? [];
        if (lista && !subs.includes(sub)) {
          const sug = parecido(sub, subs);
          out.push({ ...at, severity: 'error', code: 'P005', message: `Cada elemento de ${b.lista} no tiene «${sub}».${sug ? ` ¿Quisiste decir ${base}.${sug}?` : ''}` });
        }
        continue;
      }
      if (deApp.has(n)) continue;
      if (CLAVES_NOTARIA.has(n)) {
        out.push({ ...at, severity: 'error', code: 'P006', message: `«${n}» es un dato de la notaría: escríbelo como {{SYSTEM:${n}}}.` });
        continue;
      }
      // Literales de comparación sin comillas (`TIPO_DOC == POLIZA`): valores de un campo de control.
      if (campos.some((c) => c.valores?.includes(n))) continue;
      const sug = parecido(n, [...nombresApp, ...nombresNotaria.map((x) => `SYSTEM:${x}`)]);
      out.push({ ...at, severity: 'error', code: 'P007', message: `«${n}» no es un campo de este documento.${sug ? ` ¿Quisiste decir ${sug}?` : ''}` });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

/** Los `{{WORD_STYLE:X}}` que usa una plantilla: son los estilos que su Word de membrete debe definir. */
export function estilosUsados(texto: string): string[] {
  const s = new Set<string>();
  for (const m of texto.matchAll(/\{\{\s*WORD_STYLE\s*:\s*([^}]+?)\s*\}\}/gi)) s.add(m[1]);
  return [...s];
}

// =============================================================================
// Word: fusión con el membrete y validación del membrete (platform)
// =============================================================================

export interface PlatformArgs {
  platformUrl: string;
  serviceKey: string;
}

/** La carta genérica (A4, estilos Normal, encabezados, lista y «Texto legal»), sin datos de nadie.
 *  Es el membrete de quien todavía no ha subido el suyo (D8). */
export function cartaGenerica(): Uint8Array {
  return Uint8Array.from(Buffer.from(CARTA_GENERICA_DOCX_BASE64, 'base64'));
}

/**
 * Markdown + Word de membrete → `.docx`, por la fusión de platform (`POST /internal/docx` con
 * `markdown` + `referencia`): conserva cabecera, pie, márgenes y estilos del Word y sólo pone el cuerpo.
 * `avisos`: lo que la fusión no pudo respetar (un estilo que el Word no define).
 */
export async function fusionarConMembrete(
  args: PlatformArgs & { markdown: string; membrete?: Uint8Array | null },
): Promise<{ docx: Uint8Array; avisos: string[] }> {
  const referencia = Buffer.from(args.membrete ?? cartaGenerica()).toString('base64');
  const res = await fetch(`${args.platformUrl.replace(/\/+$/, '')}/internal/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': args.serviceKey },
    body: JSON.stringify({ markdown: args.markdown, referencia }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fusión .docx de platform devolvió ${res.status}: ${text.slice(0, 200)}`);
  }
  let avisos: string[] = [];
  try {
    avisos = JSON.parse(decodeURIComponent(res.headers.get('X-Fusion-Avisos') ?? '%5B%5D'));
  } catch {
    avisos = [];
  }
  return { docx: new Uint8Array(await res.arrayBuffer()), avisos };
}

export interface InformeMembrete {
  valido: boolean;
  hallazgos: { nivel: 'error' | 'aviso'; codigo?: string; mensaje: string }[];
  /** Lo que platform pudo leer del Word (estilos, márgenes, si hay cabecera o pie), para la pantalla. */
  resumen?: Record<string, unknown>;
}

/** Valida un Word que la notaría sube como membrete (`POST /internal/docx/validar`). */
export async function validarMembrete(
  args: PlatformArgs & { membrete: Uint8Array; estilosRequeridos: string[] },
): Promise<InformeMembrete> {
  const res = await fetch(`${args.platformUrl.replace(/\/+$/, '')}/internal/docx/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': args.serviceKey },
    body: JSON.stringify({ referencia: Buffer.from(args.membrete).toString('base64'), estilosRequeridos: args.estilosRequeridos }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Validación de membrete de platform devolvió ${res.status}: ${text.slice(0, 200)}`);
  }
  const { data } = (await res.json()) as {
    data: { valida?: boolean; hallazgos?: InformeMembrete['hallazgos']; resumen?: Record<string, unknown> };
  };
  const hallazgos = data?.hallazgos ?? [];
  return {
    valido: data?.valida ?? !hallazgos.some((h) => h.nivel === 'error'),
    hallazgos,
    resumen: data?.resumen,
  };
}

// =============================================================================
// Membrete por plantilla (tabla `documento_membrete`, D9)
// =============================================================================
//
// Por SQL y no por el modelo Prisma: así las apps no tienen que espejar `DocumentoMembrete` (ni la relación
// inversa en su `Organization`). Los listados NUNCA leen `contenido`.

export interface MembreteInfo {
  eventKey: string;
  nombre: string;
  huella: string;
  tamanoBytes: number;
  validacion: InformeMembrete | Record<string, never>;
  updatedAt: Date;
}

/** Tope de tamaño de un Word de membrete. Un membrete con logo ronda los cientos de KB. */
export const TAMANO_MAXIMO_MEMBRETE = 5 * 1024 * 1024;

export async function listarMembretes(db: DbSql, orgId: string, appSlug: string): Promise<MembreteInfo[]> {
  return db.$queryRawUnsafe<MembreteInfo[]>(
    `SELECT "eventKey", nombre, huella, "tamanoBytes", validacion, "updatedAt"
       FROM documento_membrete WHERE "orgId" = $1 AND "appSlug" = $2 ORDER BY "eventKey"`,
    orgId,
    appSlug,
  );
}

/** El Word de membrete de esa plantilla, o null (→ carta genérica). */
export async function leerMembrete(db: DbSql, orgId: string, appSlug: string, eventKey: string): Promise<Uint8Array | null> {
  const filas = await db.$queryRawUnsafe<{ contenido: Uint8Array }[]>(
    `SELECT contenido FROM documento_membrete WHERE "orgId" = $1 AND "appSlug" = $2 AND "eventKey" = $3 LIMIT 1`,
    orgId,
    appSlug,
    eventKey,
  );
  return filas[0]?.contenido ? Uint8Array.from(filas[0].contenido) : null;
}

export async function guardarMembrete(
  db: DbSql,
  m: { orgId: string; appSlug: string; eventKey: string; nombre: string; contenido: Uint8Array; validacion: InformeMembrete; subidoPor?: string | null },
): Promise<{ huella: string }> {
  if (!db.$executeRawUnsafe) throw new Error('guardarMembrete necesita $executeRawUnsafe');
  const { createHash, randomUUID } = await import('node:crypto');
  const huella = createHash('sha256').update(m.contenido).digest('hex');
  await db.$executeRawUnsafe(
    `INSERT INTO documento_membrete ("id","orgId","appSlug","eventKey","nombre","contenido","huella","tamanoBytes","validacion","subidoPor","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,now())
     ON CONFLICT ("orgId","appSlug","eventKey") DO UPDATE SET
       nombre = EXCLUDED.nombre, contenido = EXCLUDED.contenido, huella = EXCLUDED.huella,
       "tamanoBytes" = EXCLUDED."tamanoBytes", validacion = EXCLUDED.validacion,
       "subidoPor" = EXCLUDED."subidoPor", "updatedAt" = now()`,
    randomUUID(),
    m.orgId,
    m.appSlug,
    m.eventKey,
    m.nombre.slice(0, 255),
    Buffer.from(m.contenido),
    huella,
    m.contenido.byteLength,
    JSON.stringify(m.validacion),
    m.subidoPor ?? null,
  );
  return { huella };
}

export async function borrarMembrete(db: DbSql, orgId: string, appSlug: string, eventKey: string): Promise<void> {
  if (!db.$executeRawUnsafe) throw new Error('borrarMembrete necesita $executeRawUnsafe');
  await db.$executeRawUnsafe(
    `DELETE FROM documento_membrete WHERE "orgId" = $1 AND "appSlug" = $2 AND "eventKey" = $3`,
    orgId,
    appSlug,
    eventKey,
  );
}

// =============================================================================
// Generar: todo el recorrido, igual en las dos apps
// =============================================================================

export type ResultadoGeneracion =
  | { ok: true; docx: Uint8Array; markdown: string; avisos: string[] }
  | {
      ok: false;
      codigo: 'FALTAN_DATOS_NOTARIA' | 'DOCUMENTO_BLOQUEADO';
      mensaje: string;
      faltan?: DatoQueFalta[];
      bloqueos?: string[];
    };

/**
 * Datos de la notaría → comprobar que no falta ninguno de los que usa la plantilla → componer → fusionar
 * con el membrete de esa plantilla (o la carta genérica).
 *
 * Si falta un dato de la notaría NO se genera: «Yo, , Notario» no sale nunca (10.2). Se devuelve qué falta
 * y dónde se rellena, y la ruta lo convierte en un 422 que la pantalla enseña.
 *
 * `soloTexto`: no fusiona (para el texto plano del oficio, #127, y la vista previa en pantalla).
 */
export async function generarDocumento(opts: {
  db: DbSql;
  orgId: string;
  appSlug: string;
  eventKey: string;
  plantilla: string;
  campos: CampoPlantilla[];
  valores: Record<string, unknown>;
  notarioFirmanteId?: string | null;
  locale?: string;
  platform: PlatformArgs;
  soloTexto?: boolean;
  /** Vista previa en el editor: no se exige que estén los datos de la notaría (se marcan, no bloquean). */
  vistaPrevia?: boolean;
}): Promise<ResultadoGeneracion> {
  const notaria = await datosNotaria(opts.db, opts.orgId, { notarioFirmanteId: opts.notarioFirmanteId });
  const faltan = datosNotariaQueFaltan(opts.plantilla, notaria);
  if (faltan.length && !opts.vistaPrevia) {
    return {
      ok: false,
      codigo: 'FALTAN_DATOS_NOTARIA',
      mensaje:
        'No se puede generar el documento: faltan datos de la notaría. ' +
        faltan.map((f) => `${f.label} (${f.dondeSeRellena})`).join('; ') +
        '.',
      faltan,
    };
  }
  if (opts.vistaPrevia) {
    for (const f of faltan) notaria.valores[f.key] = `[${f.label}]`;
  }

  const c = componerPlantilla({ plantilla: opts.plantilla, campos: opts.campos, valores: opts.valores, notaria, locale: opts.locale });
  if (c.bloqueos.length && !opts.vistaPrevia) {
    return { ok: false, codigo: 'DOCUMENTO_BLOQUEADO', mensaje: c.bloqueos.join(' '), bloqueos: c.bloqueos };
  }
  if (opts.soloTexto) return { ok: true, docx: new Uint8Array(), markdown: c.markdown, avisos: c.avisos };

  const membrete = await leerMembrete(opts.db, opts.orgId, opts.appSlug, opts.eventKey);
  const f = await fusionarConMembrete({ ...opts.platform, markdown: c.markdown, membrete });
  return { ok: true, docx: f.docx, markdown: c.markdown, avisos: [...c.avisos, ...f.avisos] };
}
