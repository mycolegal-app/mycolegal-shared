// `{{SCHEMA_ACT:1104}}` — el acto jurídico que cubre el esquema, por su código IUI.
//
// ⚠️ RETIRADA el 12-nov-2026: la forma es `{{SCHEMA:ACT=1104}}` (`schema-meta.ts`). Ésta ya no da valor a nada y
// es un error (E926); lo de abajo la reconoce sólo para señalarla.
//
// QUÉ RESUELVE (F1.9, decidido por Carles el 6-oct-2026)
//
// El esquema tiene que poder decir de sí mismo a qué acto pertenece, qué es y en
// qué idioma está redactado, sin depender de dónde esté guardado. La descripción
// y el idioma ya tenían directiva —`{{SUMMARY:…}}` y `{{LANG=xx}}`— y **se
// conservan** porque valen también para los párrafos. Lo único que faltaba es el
// acto, y eso sólo tiene sentido en un ESQUEMA: un párrafo no cubre un acto, lo
// usan esquemas de actos distintos.
//
// POR QUÉ `SCHEMA_ACT` Y NO `SCHEMA_CODE`
//
// Porque el código es el del **acto** (`1104` = renuncia de herencia), no el del
// esquema: el esquema ya tiene su identidad en la clave
// (`1104_ESQUEMA_MAESTRO_RENUNCIA_HERENCIA`), y varios esquemas comparten acto.
//
// CONTRA QUÉ SE COTEJA
//
// Con nada: desde el 12-nov-2026 manda el esquema. Antes la carga exigía que la
// directiva coincidiera con la carpeta del acto en `_PROD`; ya no.
//
// QUÉ HACE EL MOTOR CON ELLA
//
// Nada al componer: es metadato, sale 0 caracteres. No es un campo, no se
// renombra con el sufijo de un INCLUDE y no entra en `esquemaDeCampos`. El
// validador avisa si el código no tiene forma de código IUI (E120) o si se
// declara dos veces (W120).

import { idiomaDePlantilla, IDIOMA_POR_DEFECTO } from './template-lang';
import { declaracionesSchema, leerSchema, problemaDeValor, type MetaSchema } from './schema-meta';

/** Un código de acto IUI: cuatro dígitos (`0505`, `1104`, `1701`). */
export const CODIGO_ACTO = /^[0-9]{4}$/;

const CUERPO = /^\s*SCHEMA_ACT\s*:\s*([\s\S]*?)\s*$/i;
const SUMMARY = /\{\{\s*SUMMARY\s*:\s*([^}]*?)\s*\}\}/i;

/** ¿El cuerpo de una directiva (lo que va entre `{{` y `}}`) es un `SCHEMA_ACT`? */
export function esSchemaAct(cuerpo: string): boolean {
  return /^\s*SCHEMA_ACT\s*:/i.test(cuerpo);
}

/** El código tal como está escrito (recortado), o `null` si el cuerpo no es un
 *  `SCHEMA_ACT`. No valida la forma: eso es cosa de quien lo use. */
export function codigoDeSchemaAct(cuerpo: string): string | null {
  const m = cuerpo.match(CUERPO);
  return m ? m[1].trim() : null;
}

export interface MetadatosDeEsquema {
  /** Código IUI del acto (`SCHEMA:ACT`), o `null` si no lo declara o está mal. */
  actoCodigo: string | null;
  /** Texto del primer `{{SUMMARY:…}}`, o `null` si no hay o está vacío. */
  descripcion: string | null;
  /** De `{{SCHEMA:LANG=xx}}`; `es` si no lo declara. */
  idioma: string;
  /** Todo lo que declara con `SCHEMA:` (12-nov-2026): alias, familia, variante, grupos. */
  schema: MetaSchema;
  /** Problemas que impiden fiarse de los metadatos, en palabras (también la forma retirada). Vacío = bien. */
  errores: string[];
}

export interface MetadatosDeParrafo {
  descripcion: string | null;
  idioma: string;
  errores: string[];
}

function descripcionDe(md: string): string | null {
  const m = md.match(SUMMARY);
  const t = m ? m[1].trim() : '';
  return t ? t : null;
}

/** Errores de forma y de repetición de las declaraciones `SCHEMA:` de un esquema. */
export function erroresDeDeclaraciones(md: string): { errores: string[] } {
  const errores: string[] = [];
  const porClave = new Map<string, { valor: string; legado: boolean }[]>();
  for (const d of declaracionesSchema(md)) {
    if (d.legado) {
      errores.push(`forma retirada: ${d.clave === 'ACT' ? `{{SCHEMA_ACT:${d.valor}}} → {{SCHEMA:ACT=${d.valor}}}` : `{{LANG=${d.valor}}} → {{SCHEMA:LANG=${d.valor}}}`}`);
      continue;
    }
    const p = problemaDeValor(d.clave, d.valor);
    if (p) errores.push(p);
    const l = porClave.get(d.clave) ?? [];
    l.push(d);
    porClave.set(d.clave, l);
  }
  for (const [clave, ds] of porClave) {
    if (ds.length < 2) continue;
    errores.push(`SCHEMA:${clave} declarado ${ds.length} veces (${ds.map((d) => d.valor).join(' / ')}): una sola declaración por clave`);
  }
  return { errores };
}

/**
 * Los metadatos que declara un ESQUEMA: acto, descripción, idioma y el resto de `SCHEMA:`.
 *
 * Es lo que la carga de la biblioteca guarda en sus columnas. Una declaración mal
 * formada o repetida va a `errores`: la carga decide si eso la para (la de Redactor sí).
 */
export function metadatosDeEsquema(md: string): MetadatosDeEsquema {
  const { errores } = erroresDeDeclaraciones(md);
  const schema = leerSchema(md);
  return {
    actoCodigo: schema.act || null,
    descripcion: descripcionDe(md),
    idioma: idiomaDePlantilla(md, IDIOMA_POR_DEFECTO),
    schema,
    errores,
  };
}

/** Los metadatos que declara un PÁRRAFO: descripción e idioma (éste, `es`: un párrafo no lo declara). Declarar
 *  `SCHEMA:` en un párrafo es un error: lo que es el documento lo dice el esquema. La forma retirada, también. */
export function metadatosDeParrafo(md: string): MetadatosDeParrafo {
  const errores: string[] = [];
  const decl = declaracionesSchema(md);
  const claves = [...new Set(decl.filter((d) => !d.legado).map((d) => d.clave))];
  if (claves.length) errores.push(`SCHEMA:${claves.join(', SCHEMA:')} sólo puede declararse en un esquema, no en un párrafo`);
  for (const d of decl.filter((x) => x.legado)) errores.push(`forma retirada: ${d.clave === 'ACT' ? `{{SCHEMA_ACT:${d.valor}}}` : `{{LANG=${d.valor}}}`}`);
  return { descripcion: descripcionDe(md), idioma: idiomaDePlantilla(md, IDIOMA_POR_DEFECTO), errores };
}
