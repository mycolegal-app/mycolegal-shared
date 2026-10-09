// Puerto del CATÁLOGO UNIVERSAL: lo que el motor necesita saber de él para comprobar los
// `:REQ(…)` y `:DOC(…)` de los esquemas.
//
// El motor no sabe de dónde sale: Redactor lo rellena desde la BD (`atributo_defs_global`,
// `document_types_global`, `rol_sujeto_global`) y los tests y la medición de la biblioteca,
// desde `catalogos/catalogo_req.json`, que emite el build del catálogo (`catalogoDesdeJson`).
// La forma del JSON está acordada en la cabecera de `PLAN_TECNICO_REQ_CATALOGO_IUI.md`.

export type ClaseAtributo = 'HECHO' | 'DATO';

export interface IuiAtributo {
  /** Relativa al ancla de su ámbito, sin índices (`PER/ESTADO_CIVIL`). */
  ruta?: string;
  /** `DOC`: un ACTO que cuelga de `DOC_NOT` y no de la operación. */
  nivel?: string;
  /** Valor del catálogo → código del IUI. */
  valores?: Record<string, string>;
  /** Nombre de una regla de `reglasDeducidas`: el código no sale de una tabla. */
  deducido?: string;
}

/** Un hecho o un dato del catálogo. */
export interface AtributoCatalogo {
  /** Con prefijo: `SUJETO.ESTADO_CIVIL`. */
  ref: string;
  ambito: string;
  /** Tipo de sujeto u objeto al que se aplica; `null` en ACTO. */
  tipo: string | null;
  clase: ClaseAtributo;
  /** BOOL | ENUM | NUMERO | TEXTO | FECHA (los nombres del catálogo, no los del lenguaje). */
  tipoDato: string;
  opciones?: string[] | null;
  /** Texto para preguntarlo a una persona. */
  pregunta?: string | null;
  iui?: IuiAtributo | null;
  /** Cuántas reglas lo consultan (0 en los datos). */
  usoEnReglas?: number;
}

export interface DocumentoCatalogo {
  codigo: string;
  nombre?: string;
  modoCumplimiento?: string;
}

export interface RolCatalogo {
  codigo: string;
  nombre?: string;
  parent?: string | null;
}

export interface CatalogoReq {
  atributo(ref: string): AtributoCatalogo | undefined;
  documento(codigo: string): DocumentoCatalogo | undefined;
  rol(codigo: string): RolCatalogo | undefined;
}

/** Forma de `catalogos/catalogo_req.json`. */
export interface CatalogoReqJson {
  version: string;
  atributos: AtributoCatalogo[];
  documentos: DocumentoCatalogo[];
  roles: RolCatalogo[];
  actos?: Array<{ codigo: string; iuiClases?: string[][] | null }>;
  reglasDeducidas?: string[];
}

/** El puerto sobre el JSON del build del catálogo (o sobre listas montadas por la app). */
export function catalogoDesdeJson(json: Pick<CatalogoReqJson, 'atributos' | 'documentos' | 'roles'>): CatalogoReq {
  const atributos = new Map(json.atributos.map((a) => [a.ref.toUpperCase(), a]));
  const documentos = new Map(json.documentos.map((d) => [d.codigo.toUpperCase(), d]));
  const roles = new Map(json.roles.map((r) => [r.codigo.toUpperCase(), r]));
  return {
    atributo: (ref) => atributos.get(ref.toUpperCase()),
    documento: (codigo) => documentos.get(codigo.toUpperCase()),
    rol: (codigo) => roles.get(codigo.toUpperCase()),
  };
}
