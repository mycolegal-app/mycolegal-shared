// Enlaces de un esquema con el catálogo: qué condiciones y datos llevan `:REQ`/`:DOC`, y
// cuáles no se pueden preguntar ni esperar a ningún documento.
//
// Es la medición de F2/F3 del plan REQ_CATALOGO_IUI y la base de los avisos que no son de un
// fichero sino del esquema EXPANDIDO (una condición se declara en un VAR y se usa en otro
// párrafo):
//
// - **W910** condición sin forma de preguntarla: ni `:INPUT` ni `:REQ` a un hecho con
//   `pregunta`. Redactor tendría que enseñar el nombre de la variable.
// - **W911** condición sin fuente: ni `:DOC` ni `:INPUT`. No espera a ningún documento ni se
//   pregunta: sólo la puede decidir la IA leyendo lo que haya.

import { parseFields, FieldType } from '../syntax/parser';
import { extractIfFieldRefs } from '../syntax/validator';
import { getSystemFields } from '../compose/engine';
import type { ReqDecl } from '../syntax/req-doc';
import type { CatalogoReq } from '../ports/catalogo';

export interface EnlaceDeCampo {
  nombre: string;
  /** Gobierna algún `{{IF}}`. */
  condicion: boolean;
  /** `DECLARE X=valor` sin opciones (o `SET`): lo fija el autor, no se pregunta. No cuenta
   *  como condición ni como dato. */
  constante: boolean;
  /** Se pinta en algún sitio. */
  pintado: boolean;
  tieneInput: boolean;
  req: ReqDecl[];
  doc: string[];
  /** W910 (sólo condiciones). */
  sinPregunta: boolean;
  /** W911 (sólo condiciones). */
  sinFuente: boolean;
}

export interface EnlacesDeEsquema {
  campos: EnlaceDeCampo[];
  resumen: {
    condiciones: number;
    datos: number;
    condicionesConReq: number;
    condicionesConDoc: number;
    condicionesConInput: number;
    datosConReq: number;
    sinPregunta: number;
    sinFuente: number;
  };
}

/**
 * `texto` es el esquema YA EXPANDIDO (`expandirIncludes`). Sin catálogo, un `:REQ` cuenta
 * como forma de preguntar (no se puede saber si su hecho tiene `pregunta`).
 */
export function enlacesDeEsquema(texto: string, catalogo?: CatalogoReq): EnlacesDeEsquema {
  const sistema = new Set(Object.keys(getSystemFields()).map((k) => k.toUpperCase()));
  const porNombre = new Map<string, EnlaceDeCampo>();
  const de = (nombre: string): EnlaceDeCampo => {
    let e = porNombre.get(nombre);
    if (!e) {
      e = { nombre, condicion: false, constante: false, pintado: false, tieneInput: false, req: [], doc: [], sinPregunta: false, sinFuente: false };
      porNombre.set(nombre, e);
    }
    return e;
  };

  for (const f of parseFields(texto)) {
    switch (f.fieldType) {
      case FieldType.DECLARE:
      case FieldType.DECLARE_ARRAY: {
        const e = de(f.name);
        if (f.inputDescription) e.tieneInput = true;
        if (f.declareValue && !f.extractionOptions.length && !f.inputDescription) e.constante = true;
        // La primera declaración con enlace manda; las divergencias las cuenta
        // `declaracionesDivergentes` en `analizarBiblioteca`.
        if (!e.req.length && f.req.length) e.req = f.req;
        if (!e.doc.length && f.doc.length) e.doc = f.doc;
        break;
      }
      case FieldType.INPUT:
      case FieldType.INPUT_FINAL:
        de(f.name).tieneInput = true;
        de(f.name).pintado = true;
        break;
      case FieldType.SET:
        if (f.name) de(f.name).constante = true;
        break;
      case FieldType.CONDITIONAL:
        for (const n of extractIfFieldRefs(f.content)) {
          const nombre = n.replace(/^SYSTEM:/i, '');
          if (n.toUpperCase().startsWith('SYSTEM:') || nombre.toUpperCase() === 'COUNT' || sistema.has(nombre.toUpperCase())) continue;
          de(nombre).condicion = true;
        }
        break;
      case FieldType.EXTRACTED:
        if (f.name && !f.name.startsWith('@') && !sistema.has(f.name.toUpperCase())) de(f.name).pintado = true;
        break;
      default:
        break;
    }
  }

  const campos = [...porNombre.values()].filter((e) => !e.constante && (e.condicion || e.pintado));
  for (const e of campos) {
    if (!e.condicion) continue;
    const reqConPregunta = e.req.some((r) => r.ref && (catalogo ? Boolean(catalogo.atributo(r.ref)?.pregunta) : true));
    e.sinPregunta = !e.tieneInput && !reqConPregunta;
    e.sinFuente = !e.tieneInput && e.doc.length === 0;
  }
  const condiciones = campos.filter((e) => e.condicion);
  const datos = campos.filter((e) => !e.condicion);
  return {
    campos,
    resumen: {
      condiciones: condiciones.length,
      datos: datos.length,
      condicionesConReq: condiciones.filter((e) => e.req.length).length,
      condicionesConDoc: condiciones.filter((e) => e.doc.length).length,
      condicionesConInput: condiciones.filter((e) => e.tieneInput).length,
      datosConReq: datos.filter((e) => e.req.length).length,
      sinPregunta: condiciones.filter((e) => e.sinPregunta).length,
      sinFuente: condiciones.filter((e) => e.sinFuente).length,
    },
  };
}
