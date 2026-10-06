// `{{SCHEMA_ACT:1104}}` — el acto jurídico que cubre el esquema, por su código IUI.
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
// En `_PROD` cada esquema vive dentro de la carpeta de su acto
// (`IUI_ActosNotariales/G11_HERENCIAS/1104_RENUNCIA_HERENCIA/…`). La carga de la
// biblioteca exige que la directiva y la carpeta digan lo mismo; eso lo hace la
// carga, no el motor, porque el motor no sabe de carpetas.
//
// QUÉ HACE EL MOTOR CON ELLA
//
// Nada al componer: es metadato, sale 0 caracteres. No es un campo, no se
// renombra con el sufijo de un INCLUDE y no entra en `esquemaDeCampos`. El
// validador avisa si el código no tiene forma de código IUI (E120) o si se
// declara dos veces (W120).

import { idiomaDePlantilla, IDIOMA_POR_DEFECTO } from './template-lang';

/** Un código de acto IUI: cuatro dígitos (`0505`, `1104`, `1701`). */
export const CODIGO_ACTO = /^[0-9]{4}$/;

const CUERPO = /^\s*SCHEMA_ACT\s*:\s*([\s\S]*?)\s*$/i;
const DIRECTIVA = /\{\{\s*SCHEMA_ACT\s*:\s*([^}]*?)\s*\}\}/gi;
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
  /** Código IUI del acto (`SCHEMA_ACT`), o `null` si no lo declara o está mal. */
  actoCodigo: string | null;
  /** Texto del primer `{{SUMMARY:…}}`, o `null` si no hay o está vacío. */
  descripcion: string | null;
  /** Del primer `{{LANG=xx}}`; `es` si no lo declara. */
  idioma: string;
  /** Problemas que impiden fiarse de los metadatos, en palabras. Vacío = bien. */
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

/**
 * Los metadatos que declara un ESQUEMA: acto, descripción e idioma.
 *
 * Es lo que la carga de la biblioteca guarda en sus columnas. Un `SCHEMA_ACT` mal
 * formado o repetido va a `errores` y `actoCodigo` queda en `null`: la carga
 * decide si eso la para (la de Redactor sí).
 */
export function metadatosDeEsquema(md: string): MetadatosDeEsquema {
  const errores: string[] = [];
  const codigos = [...md.matchAll(DIRECTIVA)].map((m) => m[1].trim());
  let actoCodigo: string | null = null;
  if (codigos.length > 1 && new Set(codigos).size > 1) {
    errores.push(`SCHEMA_ACT declarado ${codigos.length} veces con códigos distintos (${codigos.join(', ')})`);
  } else if (codigos.length >= 1) {
    if (CODIGO_ACTO.test(codigos[0])) actoCodigo = codigos[0];
    else errores.push(`SCHEMA_ACT «${codigos[0]}» no es un código de acto IUI (cuatro dígitos)`);
  }
  return {
    actoCodigo,
    descripcion: descripcionDe(md),
    idioma: idiomaDePlantilla(md, IDIOMA_POR_DEFECTO),
    errores,
  };
}

/** Los metadatos que declara un PÁRRAFO: descripción e idioma. Un `SCHEMA_ACT`
 *  en un párrafo es un error: el acto es del esquema. */
export function metadatosDeParrafo(md: string): MetadatosDeParrafo {
  const errores: string[] = [];
  DIRECTIVA.lastIndex = 0;
  if (DIRECTIVA.test(md)) errores.push('SCHEMA_ACT sólo puede ir en un esquema, no en un párrafo');
  DIRECTIVA.lastIndex = 0;
  return { descripcion: descripcionDe(md), idioma: idiomaDePlantilla(md, IDIOMA_POR_DEFECTO), errores };
}
