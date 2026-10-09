// `:REQ(…)` y `:DOC(…)`: el enlace de un campo con el catálogo universal de requisitos.
//
//   {{DECLARE TIPO_FINCA:[…]:OPTIONS(Urbana,Rústica)
//       :REQ(OBJETO.SUELO_URBANO_IIVTNU; Urbana=TRUE; Rústica=FALSE)
//       :DOC(REQ_NOTA_SIMPLE | REQ_CCDG)}}
//
// - `:REQ(<hecho o dato>[@<ROL>] [; <valor del campo>=<valor del catálogo>]…)` dice a qué
//   hecho o dato del catálogo equivale el campo. Puede haber varios: cuando un valor del campo
//   fija varios hechos a la vez, cada hecho lleva el suyo. `@*` = algún interviniente; sin rol,
//   el hecho es del acto o del objeto. En una lista (`DECLARE ARRAY`), `:REQ(@ROL)` sin hecho
//   da el papel a todos sus subcampos.
// - `:DOC(<tipo> [| <tipo>]…)` dice de qué documentos del catálogo sale la respuesta
//   (cualquiera de los listados).
//
// Diseño: `PLAN_TECNICO_REQ_CATALOGO_IUI.md` (mycolegal-redactor), DC1-DC3 y DR1.
//
// Se pelan ANTES que el resto de sufijos del DECLARE: el `=valor` genérico del parser se
// comería el `=` del mapa (`Urbana=TRUE`) y el campo caería a W055.

/** Un `:REQ(…)` ya analizado. */
export interface ReqDecl {
  /** `AMBITO.CODIGO` tal cual se escribió (en mayúsculas). `null` en `:REQ(@ROL)` de una lista. */
  ref: string | null;
  /** `SUJETO` | `OBJETO` | `ACTO` | … (lo que va antes del punto). */
  ambito: string | null;
  /** Lo que va después del punto, sin prefijo: la clave de `atributo_defs_global.codigo`. */
  codigo: string | null;
  /** Rol del catálogo (`VENDEDOR`), `'*'` (algún interviniente) o `null` (acto u objeto). */
  rol: string | null;
  /** Pares `[valor del campo, valor del catálogo]`, sin comillas. `null` = sin mapa: los
   *  valores tienen que coincidir (normalizados). */
  mapa: Array<[string, string]> | null;
  /** El cuerpo tal cual, para los mensajes. */
  texto: string;
}

export interface ReqDoc {
  req: ReqDecl[];
  doc: string[];
  /** Cuerpos que no se han podido leer (E906). */
  errores: string[];
}

const REF = /^([A-Z][A-Z0-9_]*)\.([A-Z0-9_]+)$/;
const ROL = /^(\*|[A-Z][A-Z0-9_]*)$/;

/** Cierre del paréntesis que abre en `abre`, contando anidados y saltando comillas.
 *  -1 si no se cierra. */
function cierre(texto: string, abre: number): number {
  let prof = 0;
  let comilla: string | null = null;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (comilla) {
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"') comilla = c;
    else if (c === '(') prof++;
    else if (c === ')' && --prof === 0) return i;
  }
  return -1;
}

/** Parte por `sep` fuera de comillas y paréntesis. */
function partir(cuerpo: string, sep: string): string[] {
  const out: string[] = [];
  let buf = '';
  let comilla: string | null = null;
  let prof = 0;
  for (const c of cuerpo) {
    if (comilla) {
      buf += c;
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"') comilla = c;
    else if (c === '(') prof++;
    else if (c === ')' && prof > 0) prof--;
    else if (c === sep && prof === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  out.push(buf.trim());
  return out;
}

function sinComillas(s: string): string {
  const t = s.trim();
  return t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"' ? t.slice(1, -1) : t;
}

/** Primer `=` fuera de comillas. */
function igual(par: string): number {
  let comilla = false;
  for (let i = 0; i < par.length; i++) {
    if (par[i] === '"') comilla = !comilla;
    else if (par[i] === '=' && !comilla) return i;
  }
  return -1;
}

/** Lee el cuerpo de un `:REQ(…)`. Devuelve `null` si está mal formado. */
export function leerReq(cuerpo: string): ReqDecl | null {
  const [cabeza, ...pares] = partir(cuerpo, ';');
  if (!cabeza) return null;
  const [refTexto, rolTexto, ...sobra] = cabeza.split('@').map((s) => s.trim());
  if (sobra.length) return null;

  let ref: string | null = null;
  let ambito: string | null = null;
  let codigo: string | null = null;
  if (refTexto) {
    const m = REF.exec(refTexto.toUpperCase());
    if (!m) return null;
    ref = refTexto.toUpperCase();
    ambito = m[1];
    codigo = m[2];
  }
  let rol: string | null = null;
  if (rolTexto !== undefined) {
    if (!ROL.test(rolTexto.toUpperCase())) return null;
    rol = rolTexto.toUpperCase();
  }
  if (!ref && !rol) return null;
  // `:REQ(@ROL)` sin hecho no admite mapa: no hay a qué traducir.
  if (!ref && pares.some(Boolean)) return null;

  let mapa: Array<[string, string]> | null = null;
  for (const par of pares) {
    if (!par) continue;
    const i = igual(par);
    if (i <= 0 || i === par.length - 1) return null;
    (mapa ??= []).push([sinComillas(par.slice(0, i)), sinComillas(par.slice(i + 1))]);
  }
  return { ref, ambito, codigo, rol, mapa, texto: cuerpo.trim() };
}

/** Lee el cuerpo de un `:DOC(…)`: tipos separados por `|`. `null` si queda alguno vacío. */
export function leerDoc(cuerpo: string): string[] | null {
  const tipos = partir(cuerpo, '|').map((t) => sinComillas(t).trim());
  if (tipos.some((t) => !/^[A-Za-z][\w]*$/.test(t))) return null;
  return tipos.map((t) => t.toUpperCase());
}

/** ¿`i` está fuera de todo `(…)` y `[…]`? (para el nivel superior de un DECLARE ARRAY) */
function nivelSuperior(texto: string, hasta: number): boolean {
  let prof = 0;
  for (let i = 0; i < hasta; i++) {
    const c = texto[i];
    if (c === '(' || c === '[') prof++;
    else if ((c === ')' || c === ']') && prof > 0) prof--;
  }
  return prof === 0;
}

/**
 * Quita del texto todos los `:REQ(…)` y `:DOC(…)` y los devuelve analizados.
 *
 * Con `soloNivelSuperior`, sólo los que están fuera de `(…)`/`[…]`: es lo que necesita un
 * `DECLARE ARRAY`, cuyos subcampos llevan los suyos dentro de `NOMBRE(…)`.
 */
export function pelarReqDoc(
  texto: string,
  { soloNivelSuperior = false }: { soloNivelSuperior?: boolean } = {},
): ReqDoc & { texto: string } {
  const out: ReqDoc = { req: [], doc: [], errores: [] };
  const re = /:(REQ|DOC)\(/gi;
  let resto = texto;
  let desde = 0;
  for (;;) {
    re.lastIndex = desde;
    const m = re.exec(resto);
    if (!m) break;
    if (soloNivelSuperior && !nivelSuperior(resto, m.index)) {
      desde = m.index + m[0].length;
      continue;
    }
    const abre = m.index + m[0].length - 1;
    const fin = cierre(resto, abre);
    if (fin < 0) {
      // Sin cerrar: se avisa y se deja donde está (el DECLARE caerá además a W055).
      out.errores.push(resto.slice(m.index).trim());
      break;
    }
    const cuerpo = resto.slice(abre + 1, fin);
    if (m[1].toUpperCase() === 'REQ') {
      const r = leerReq(cuerpo);
      if (r) out.req.push(r);
      else out.errores.push(`:REQ(${cuerpo})`);
    } else {
      const d = leerDoc(cuerpo);
      if (d) {
        for (const t of d) if (!out.doc.includes(t)) out.doc.push(t);
      } else {
        out.errores.push(`:DOC(${cuerpo})`);
      }
    }
    resto = resto.slice(0, m.index) + resto.slice(fin + 1);
    desde = m.index;
  }
  return { ...out, texto: resto };
}

/** El texto sin `:REQ(…)` ni `:DOC(…)`, para los escaneos con expresión regular que no los
 *  conocen (valores fijos del DECLARE, instrucciones). */
export function quitarReqDoc(texto: string): string {
  if (!/:(REQ|DOC)\(/i.test(texto)) return texto;
  return pelarReqDoc(texto).texto;
}
