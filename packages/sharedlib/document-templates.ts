// @mycolegal-app/sharedlib/document-templates — plantillas de documento PDF por
// organización, compartidas por LegiFirma, Archivo, Pólizas y Tramitación.
//
// El contrato es siempre el mismo: los textos POR DEFECTO viven en el catálogo
// EN CÓDIGO de cada app (son suyos: un recibo de provisión no se parece a un
// oficio de solicitud de copia), y la tabla `document_templates` guarda solo lo
// que cada organización haya personalizado. Lo que se repetía en las cuatro apps
// —cruzar catálogo con overrides, validar, guardar, restaurar— es lo que vive
// aquí.
//
// ⚠️ Este módulo devuelve HECHOS, no la respuesta HTTP. Las apps NO responden lo
// mismo y las diferencias son deliberadas, no descuido:
//
//   · LegiFirma y Archivo devuelven `body: null` cuando no hay override (el
//     editor abre vacío y cae al default al imprimir).
//   · Pólizas devuelve el texto VIGENTE, porque su editor abre sobre lo que
//     realmente se imprime — en un idioma sin redactar, eso es el castellano, que
//     es justo lo que hace falta para traducir encima (#653).
//   · Al restaurar, LegiFirma y Archivo BORRAN el override; Pólizas lo
//     DESACTIVA, para que la notaría pueda recuperar su versión si restauró por
//     error.
//
// Por eso cada ruta compone su payload con estos datos en vez de recibirlo
// hecho, y lo que varía de verdad viaja como parámetro explícito.
//
// `@prisma/client` es peerDependency opcional: en runtime resuelve al cliente de
// la app consumidora, que debe tener el modelo `DocumentoPlantilla` espejado.
import { prisma } from './db';
import {
  IDIOMA_DEFECTO,
  elegirPlantilla,
  idiomasCandidatos,
  normalizarIdioma,
} from './idiomas-documento';

/** Idioma del documento por defecto. Reexportado desde `idiomas-documento` para
 *  que haya UNA sola fuente: una app que normalice por su cuenta y otra que use
 *  este valor acabarían escribiendo en claves distintas de la misma tabla. */
export const IDIOMA_DOCUMENTO_DEFECTO = IDIOMA_DEFECTO;

/** Un cuerpo más corto que esto es casi seguro un borrado accidental. */
export const LONGITUD_MINIMA_CUERPO = 20;
/** Tope de tamaño: una plantilla de documento no llega ni de lejos. */
export const LONGITUD_MAXIMA_CUERPO = 200_000;

export interface DocumentTemplateMacro {
  /** Identificador que aparece en el HTML entre dobles llaves. */
  key: string;
  /** Etiqueta para mostrar en el editor. */
  label: string;
  /** Ejemplo de valor, para el preview. */
  example: string;
}

export interface DocumentTemplateEntry {
  eventKey: string;
  label: string;
  description: string;
  macros: DocumentTemplateMacro[];
  defaultBody: string;
}

/** Lo que se sabe de una plantilla: catálogo + estado del override. */
export interface EstadoPlantilla {
  entrada: DocumentTemplateEntry;
  idioma: string;
  /** La organización tiene override propio y activo para este idioma. */
  personalizada: boolean;
  /** Cuerpo del override, si lo hay (aunque esté desactivado). */
  cuerpoOverride: string | null;
  /** El texto que se imprime hoy: el suyo si lo ha personalizado, o el default. */
  cuerpoVigente: string;
  actualizadaEn: Date | null;
  /** Idiomas de ESTE documento que la organización ya tiene redactados. */
  idiomasRedactados: string[];
}

export function buscarEntrada(
  catalogo: DocumentTemplateEntry[],
  eventKey: string,
): DocumentTemplateEntry | undefined {
  return catalogo.find((e) => e.eventKey === eventKey);
}

interface OverrideFila {
  eventKey: string;
  idioma: string;
  bodyHtml: string;
  active: boolean;
  updatedAt: Date;
}

/**
 * Cruza el catálogo de la app con los overrides de la organización. Una entrada
 * por documento del catálogo, siempre — incluidos los que la organización no ha
 * tocado, que es lo que permite a la pantalla ofrecer "personalizar".
 */
export async function listarPlantillas(opts: {
  orgId: string;
  appSlug: string;
  catalogo: DocumentTemplateEntry[];
  /** Idioma que se está editando. Las apps monolingües lo omiten. */
  idioma?: string;
}): Promise<EstadoPlantilla[]> {
  const idioma = normalizarIdioma(opts.idioma);
  const overrides: OverrideFila[] = await prisma.documentoPlantilla.findMany({
    where: { orgId: opts.orgId, appSlug: opts.appSlug },
    select: { eventKey: true, idioma: true, bodyHtml: true, active: true, updatedAt: true },
  });
  const porClave = new Map(overrides.map((o) => [`${o.eventKey}:${o.idioma}`, o]));

  return opts.catalogo.map((entrada) => {
    const override = porClave.get(`${entrada.eventKey}:${idioma}`) ?? null;
    const personalizada = !!override?.active;
    return {
      entrada,
      idioma,
      personalizada,
      cuerpoOverride: override?.bodyHtml ?? null,
      cuerpoVigente: personalizada ? override!.bodyHtml : entrada.defaultBody,
      actualizadaEn: override?.updatedAt ?? null,
      idiomasRedactados: overrides
        .filter((o) => o.eventKey === entrada.eventKey && o.active)
        .map((o) => o.idioma),
    };
  });
}

/**
 * Cuerpo que debe imprimirse: el override activo de la organización si lo tiene,
 * y si no el del catálogo. Es la función que usan los generadores de PDF, y la
 * razón de que añadir una plantilla nueva no exija tocar la BD.
 *
 * `undefined` = la combinación no está en el catálogo (el llamante responde 404
 * o la deja fuera del lote, según el caso).
 */
export async function resolverCuerpo(opts: {
  orgId: string;
  appSlug: string;
  eventKey: string;
  catalogo: DocumentTemplateEntry[];
  idioma?: string;
}): Promise<string | undefined> {
  const entrada = buscarEntrada(opts.catalogo, opts.eventKey);
  if (!entrada) return undefined;

  // El modelo de un idioma NO EXISTE hasta que la organización lo redacta, así
  // que el primer documento en catalán saldría en blanco si se buscara solo ese
  // idioma. Se piden el pedido y el castellano al que recae, y se elige en ese
  // orden: mejor un documento en castellano —que el oficial ve y corrige— que
  // uno vacío. Misma regla que ya aplicaba Pólizas (#653).
  const idioma = normalizarIdioma(opts.idioma);
  const candidatas: { idioma: string; bodyHtml: string }[] =
    await prisma.documentoPlantilla.findMany({
      where: {
        orgId: opts.orgId,
        appSlug: opts.appSlug,
        eventKey: opts.eventKey,
        idioma: { in: idiomasCandidatos(idioma) },
        active: true,
      },
      select: { idioma: true, bodyHtml: true },
    });

  return elegirPlantilla(candidatas, idioma)?.bodyHtml ?? entrada.defaultBody;
}

export type ResultadoGuardar =
  | { ok: true; eventKey: string; idioma: string; personalizada: boolean; cuerpo: string }
  | { ok: false; codigo: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'MACRO_DESCONOCIDA'; mensaje: string };

/**
 * Guarda el override de una plantilla, o lo restaura al texto por defecto.
 *
 * Restaurar ocurre de dos maneras, y ambas son intencionadas: `cuerpo` vacío o
 * nulo (como hace Pólizas desde su editor) o un cuerpo idéntico al default
 * (como hacen LegiFirma y Archivo, que detectan que no hay nada que guardar).
 *
 * `alRestaurar` decide qué pasa con el override: 'borrar' lo elimina;
 * 'desactivar' lo conserva inactivo, de modo que la organización pueda recuperar
 * su versión si restauró por error.
 */
export async function guardarPlantilla(opts: {
  orgId: string;
  appSlug: string;
  eventKey: string;
  cuerpo: string | null;
  catalogo: DocumentTemplateEntry[];
  alRestaurar: 'borrar' | 'desactivar';
  idioma?: string;
  /** 'HTML' (por defecto) o 'MARKDOWN' (Pólizas edita en markdown, #622). */
  bodyFormat?: 'HTML' | 'MARKDOWN';
  /** Rechaza macros que no estén en el catálogo de la entrada. */
  validarMacros?: boolean;
}): Promise<ResultadoGuardar> {
  const entrada = buscarEntrada(opts.catalogo, opts.eventKey);
  if (!entrada) {
    return { ok: false, codigo: 'NOT_FOUND', mensaje: `Plantilla ${opts.eventKey} desconocida` };
  }
  const idioma = normalizarIdioma(opts.idioma);
  const where = { orgId: opts.orgId, appSlug: opts.appSlug, eventKey: opts.eventKey, idioma };

  const normalizado = (opts.cuerpo ?? '').trim();
  const restaurar = normalizado === '' || normalizado === entrada.defaultBody.trim();

  if (restaurar) {
    if (opts.alRestaurar === 'borrar') {
      await prisma.documentoPlantilla.deleteMany({ where });
    } else {
      await prisma.documentoPlantilla.updateMany({ where, data: { active: false } });
    }
    return {
      ok: true,
      eventKey: opts.eventKey,
      idioma,
      personalizada: false,
      cuerpo: entrada.defaultBody,
    };
  }

  if (normalizado.length < LONGITUD_MINIMA_CUERPO) {
    return {
      ok: false,
      codigo: 'VALIDATION_ERROR',
      mensaje: 'El cuerpo de la plantilla parece vacío o demasiado corto',
    };
  }
  if (normalizado.length > LONGITUD_MAXIMA_CUERPO) {
    return { ok: false, codigo: 'VALIDATION_ERROR', mensaje: 'Plantilla excesivamente grande' };
  }

  if (opts.validarMacros) {
    const desconocidas = macrosDesconocidas(normalizado, entrada.macros);
    if (desconocidas.length > 0) {
      return {
        ok: false,
        codigo: 'MACRO_DESCONOCIDA',
        mensaje:
          `La plantilla usa macros que no existen: ${desconocidas.join(', ')}. ` +
          `Disponibles: ${entrada.macros.map((m) => m.key).join(', ')}.`,
      };
    }
  }

  const bodyFormat = opts.bodyFormat ?? 'HTML';
  await prisma.documentoPlantilla.upsert({
    where: {
      orgId_appSlug_eventKey_idioma: {
        orgId: opts.orgId,
        appSlug: opts.appSlug,
        eventKey: opts.eventKey,
        idioma,
      },
    },
    create: { ...where, bodyHtml: normalizado, bodyFormat, active: true },
    update: { bodyHtml: normalizado, bodyFormat, active: true },
  });

  return { ok: true, eventKey: opts.eventKey, idioma, personalizada: true, cuerpo: normalizado };
}

/**
 * Macros usadas en el cuerpo que no están declaradas en la entrada del catálogo.
 * La sustitución de macros reemplaza por cadena vacía lo que no conoce, así que
 * una macro mal escrita saldría como un hueco silencioso en un documento que se
 * manda fuera. Mejor rechazarla al guardar.
 */
export function macrosDesconocidas(html: string, macros: DocumentTemplateMacro[]): string[] {
  const conocidas = new Set(macros.map((m) => m.key));
  const usadas = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!conocidas.has(m[1])) usadas.add(m[1]);
  }
  return [...usadas];
}
