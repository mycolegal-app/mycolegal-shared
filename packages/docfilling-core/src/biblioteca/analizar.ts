// Análisis de una biblioteca entera: los defectos que NO dan error (F1.9b).
//
// POR QUÉ ESTO ES UNA FUNCIÓN DEL PAQUETE Y NO UN SCRIPT
//
// `validateText` mira un fichero y `expandirIncludes` una cadena. Pero los
// defectos que más han costado encontrar en la biblioteca real sólo se ven mirando
// la biblioteca COMPLETA, y ninguno de los tres produce un diagnóstico:
//
//   · un párrafo que existe y que nadie incluye (**huérfano**) no se emite
//     jamás, y no hay nada que avisar: le falta un enrutador;
//   · un enrutador **vacío** resuelve perfectamente y no emite nada;
//   · una condición cuyos únicos declarantes son huérfanos **no puede ser
//     cierta nunca**, así que su cláusula no sale.
//
// Los tres se descubrieron a mano sobre `_PROD` el 2-oct-2026 (§4.13 del plan):
// 578 huérfanos de 1.615 nombres, 29 ficheros vacíos referenciados y 23
// párrafos de reducciones autonómicas cuyas variables se declaraban en un
// `VAR_ISD_*` que nadie incluía. Lo que se encontró a mano se vuelve a perder;
// esto lo hace repetible, y lo pone al alcance de Admin y del editor.

import { collectAllDeclares, type IncludeResolver } from '../syntax/validator';
import { parseFields, FieldType } from '../syntax/parser';
import { camposSoloCondicionales } from '../fields/conditional-only';
import { getSystemFields } from '../compose/engine';
import { expandirIncludes, normalizarNombre, type ParrafoRepository } from './../compose/expand-includes';
import { normalizarValor } from '../fields/req';

/** Un documento de la biblioteca: su nombre y su markdown. */
export interface Documento {
  nombre: string;
  texto: string;
}

export interface CondicionSospechosa {
  /** La variable del `{{IF}}`. */
  nombre: string;
  /** Párrafos que la usan sin poder verla declarada. */
  usadaEn: string[];
  /** Quién la declara — todos huérfanos, que es el problema. */
  declaradaEnHuerfanos: string[];
}

/** Un mismo campo declarado en varios ficheros de forma distinta (F2.4 del plan
 *  REQ_CATALOGO_IUI): según qué VAR alcance el esquema, el campo enlaza con un hecho u
 *  otro, espera a otro documento o arranca con otro valor. */
export interface DeclaracionDivergente {
  nombre: string;
  declaraciones: Array<{ documento: string; req: string; doc: string; porDefecto: string | null }>;
}

export interface AnalisisBiblioteca {
  /** Existen y ningún `{{INCLUDE}}` los pide. Aquí aparece un enrutador que falta. */
  huerfanos: string[];
  /** Ficheros sin contenido. */
  vacios: string[];
  /** Vacíos que además alguien incluye: resuelven sin aviso y no emiten nada. */
  vaciosReferenciados: string[];
  /** Con contenido pero por debajo de `umbralCasiVacio`: el patrón de «a medias». */
  casiVacios: string[];
  /** Condiciones sin ninguna declaración alcanzable. */
  condicionesSinDeclaracionAlcanzable: CondicionSospechosa[];
  /** `{{INCLUDE}}` que no resuelven, con cuántos documentos los piden. */
  faltantes: Map<string, number>;
  /** Nombres que aparecen en más de un fichero de la biblioteca. */
  nombresRepetidos: string[];
  /** Avisos sobre la propia medición: por qué una cifra puede no ser de fiar. */
  advertencias: string[];
  /** Campos declarados en varios ficheros con distinto `:REQ`, `:DOC` o valor por defecto. */
  declaracionesDivergentes: DeclaracionDivergente[];
}

export interface OpcionesAnalisis {
  /** Por debajo de cuántos caracteres se considera «casi vacío». Por defecto 60. */
  umbralCasiVacio?: number;
}

/**
 * Analiza una biblioteca completa.
 *
 * `parrafos` es el catálogo; `esquemas` son las plantillas maestras, que
 * cuentan como referenciadores pero **no** como candidatos a huérfano: una
 * plantilla es un punto de entrada, nadie la incluye por diseño.
 */
export async function analizarBiblioteca(
  parrafos: Documento[],
  esquemas: Documento[] = [],
  opciones: OpcionesAnalisis = {},
): Promise<AnalisisBiblioteca> {
  const umbral = opciones.umbralCasiVacio ?? 60;

  const biblioteca = new Map<string, string>();
  const nombresRepetidos: string[] = [];
  for (const d of parrafos) {
    const n = normalizarNombre(d.nombre);
    if (biblioteca.has(n)) nombresRepetidos.push(n);
    else biblioteca.set(n, d.texto);
  }
  const repo: ParrafoRepository = {
    getByName: async (n) => biblioteca.get(normalizarNombre(n)) ?? null,
  };
  const resolver: IncludeResolver = (n) => {
    const c = biblioteca.get(normalizarNombre(n));
    return c === undefined ? null : { content: c };
  };

  const todos = [...parrafos, ...esquemas];
  // Los campos de sistema ({{DIA}}, {{FECHA}}…) no son variables del autor.
  const ctxCampos = {
    camposDeSistema: new Set(Object.keys(getSystemFields()).map((k) => k.toUpperCase())),
    camposPredefinidos: new Set<string>(),
  };

  // Quién referencia a quién, y cómo declara cada fichero sus campos.
  const referenciados = new Set<string>();
  const formasDe = new Map<string, DeclaracionDivergente['declaraciones']>();
  for (const d of todos) {
    for (const f of parseFields(d.texto)) {
      if (f.fieldType === FieldType.INCLUDE && f.includeTarget) {
        referenciados.add(normalizarNombre(f.includeTarget));
      }
      if ((f.fieldType === FieldType.DECLARE || f.fieldType === FieldType.DECLARE_ARRAY) && f.name) {
        const l = formasDe.get(f.name) ?? [];
        l.push({
          documento: normalizarNombre(d.nombre),
          req: f.req
            .map((r) => `${r.ref ?? ''}@${r.rol ?? ''}` +
              (r.mapa ? `;${r.mapa.map(([a, b]) => `${normalizarValor(a)}=${normalizarValor(b)}`).sort().join(';')}` : ''))
            .sort().join(' + '),
          doc: [...f.doc].sort().join(' | '),
          porDefecto: f.inputDefault || f.declareValue ? normalizarValor(f.inputDefault || f.declareValue) : null,
        });
        formasDe.set(f.name, l);
      }
    }
  }
  const declaracionesDivergentes: DeclaracionDivergente[] = [];
  for (const [nombre, declaraciones] of formasDe) {
    const formas = new Set(declaraciones.map((x) => `${x.req}#${x.doc}#${x.porDefecto ?? ''}`));
    if (formas.size > 1) declaracionesDivergentes.push({ nombre, declaraciones });
  }
  declaracionesDivergentes.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const huerfanos = [...biblioteca.keys()]
    .filter((n) => !referenciados.has(n)).sort();
  const huerfanosSet = new Set(huerfanos);

  const vacios = [...biblioteca.entries()]
    .filter(([, t]) => t.trim() === '').map(([n]) => n).sort();
  const vaciosReferenciados = vacios.filter((n) => referenciados.has(n));
  const casiVacios = [...biblioteca.entries()]
    .filter(([, t]) => t.trim() !== '' && t.length < umbral).map(([n]) => n).sort();

  // Quién declara cada variable. La pregunta útil no es «¿está declarada?»
  // —casi siempre lo está en algún sitio— sino **¿es alcanzable?**: si todos
  // sus declarantes son huérfanos, no se declara nunca de verdad.
  const declaranteDe = new Map<string, string[]>();
  for (const d of todos) {
    for (const v of collectAllDeclares(d.texto, resolver)) {
      const l = declaranteDe.get(v) ?? [];
      l.push(normalizarNombre(d.nombre));
      declaranteDe.set(v, l);
    }
  }

  const faltantes = new Map<string, number>();
  const sospechosas = new Map<string, CondicionSospechosa>();

  for (const d of todos) {
    const r = await expandirIncludes(d.texto, repo);
    for (const n of r.faltantes) faltantes.set(n, (faltantes.get(n) ?? 0) + 1);

    // Sobre el texto EXPANDIDO: un párrafo puede declarar lo suyo incluyendo
    // el VAR de su territorio, que es el patrón bueno.
    const declaradasAqui = collectAllDeclares(r.texto, resolver);
    // `camposSoloCondicionales` y NO `esquemaDeCampos`: el esquema sólo lista
    // campos que se van a rellenar, así que una variable usada únicamente en un
    // `{{IF}}` y sin DECLARE **no aparece en él** — comprobado, devuelve lista
    // vacía. Con el esquema como fuente esta comprobación no podía ver nunca el
    // caso que viene a detectar, y daba cero sobre la biblioteca entera.
    for (const nombre of camposSoloCondicionales(d.texto, ctxCampos)) {
      const u = nombre.toUpperCase();
      if (declaradasAqui.has(u)) continue;
      const declarantes = declaranteDe.get(u) ?? [];
      // Sin declarante conocido, lo normal es que la declare su maestro, que
      // aquí no está: no se señala, para no inundar de falsos positivos.
      if (declarantes.length === 0) continue;
      if (declarantes.some((x) => !huerfanosSet.has(x))) continue;
      const prev = sospechosas.get(nombre);
      if (prev) prev.usadaEn.push(normalizarNombre(d.nombre));
      else sospechosas.set(nombre, {
        nombre,
        usadaEn: [normalizarNombre(d.nombre)],
        declaradaEnHuerfanos: [...new Set(declarantes)],
      });
    }
  }

  const advertencias: string[] = [];
  if (esquemas.length === 0) {
    // Medido el 3-oct-2026: sin los 105 esquemas, `condicionesSinDeclaracionAlcanzable`
    // da 274 y casi todas son falsas — los esquemas maestros son quienes incluyen
    // los `VAR_*` por acto, así que sin ellos esos VAR salen huérfanos y sus
    // declaraciones parecen inalcanzables. Con los esquemas, la cifra es otra.
    advertencias.push(
      'Sin esquemas: «huérfanos» y «condiciones sin declaración alcanzable» están ' +
      'MUY inflados, porque los esquemas maestros son quienes incluyen los VAR por acto. ' +
      'Pasa la carpeta de esquemas para que estas dos cifras signifiquen algo.',
    );
  }

  return {
    huerfanos,
    vacios,
    vaciosReferenciados,
    casiVacios,
    condicionesSinDeclaracionAlcanzable: [...sospechosas.values()],
    faltantes,
    nombresRepetidos,
    advertencias,
    declaracionesDivergentes,
  };
}
