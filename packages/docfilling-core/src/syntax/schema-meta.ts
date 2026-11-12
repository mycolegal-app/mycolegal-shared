// `{{SCHEMA:CLAVE=valor}}` — lo que el esquema declara de sí mismo (Carles, 12-nov-2026).
//
//     {{SCHEMA:ACT=1103 ALIAS ADJUDICACION_HERENCIA}}   código IUI de 4 cifras + alias opcional
//     {{SCHEMA:FAMILY=F11 ALIAS HERENCIAS}}             F + 2 cifras + alias opcional
//     {{SCHEMA:VARIANT=SOBREVIVENCIA}}                  opcional, un valor
//     {{SCHEMA:GROUP=TRANSMISION_GRATUITA, MORTIS_CAUSA}}  opcional, varios
//     {{SCHEMA:LANG=ca}}                                sustituye a {{LANG=ca}}
//
// DECLARAR sólo en ESQUEMAS y una vez por clave. LEER en esquemas y párrafos: en un `IF` (`==`, `!=`, `IN`, `NOT IN`)
// o impreso (`{{SCHEMA:ACT}}`), y siempre da el valor del ESQUEMA RAÍZ. Son constantes: nunca son pregunta.
//
// CÓMO VIAJAN. El motor (y quien evalúa condiciones por su cuenta, como Redactor) los lleva DENTRO de los valores, en
// claves que no pueden ser un campo porque llevan dos puntos (`SCHEMA:ACT`, `SCHEMA:GROUP`…), más una marca
// (`SCHEMA:`) que dice que ya se han leído. `valoresDeSchema` las construye; `evaluarAtomoSchema` las compara.
//
// COMPATIBILIDAD. `{{SCHEMA_ACT:xxxx}}` y `{{LANG=xx}}` siguen valiendo, con aviso de obsoleto (W920), y equivalen a
// `SCHEMA:ACT` y `SCHEMA:LANG`: la biblioteca de PROD sigue con ellas hasta que se cargue la migrada.

/** Las claves que un esquema puede declarar. */
export const CLAVES_SCHEMA = ['ACT', 'FAMILY', 'VARIANT', 'GROUP', 'LANG'] as const;
export type ClaveSchema = (typeof CLAVES_SCHEMA)[number];

/** Alias, variante y grupos: mayúsculas, cifras y guion bajo. */
export const NOMBRE_SCHEMA = /^[A-Z0-9_]+$/;
/** Un alias además lleva alguna letra: «11» no es un alias, es un código mal escrito. */
const esAlias = (s: string): boolean => NOMBRE_SCHEMA.test(s) && /[A-Z]/.test(s);
const ACT = /^([0-9]{4})(?:\s+ALIAS\s+(\S+))?$/;
const FAMILY = /^(F[0-9]{2})(?:\s+ALIAS\s+(\S+))?$/;
const LANG_VALOR = /^[A-Za-z][A-Za-z0-9_-]*$/;

const RE_DECLARACION = /\{\{\s*SCHEMA\s*:\s*([A-Za-z_]\w*)\s*=\s*([^}]*?)\s*\}\}/g;
const RE_LECTURA = /\{\{\s*SCHEMA\s*:\s*([A-Za-z_]\w*)\s*\}\}/g;
const RE_SCHEMA_ACT = /\{\{\s*SCHEMA_ACT\s*:\s*([^}]*?)\s*\}\}/gi;
const RE_LANG = /\{\{\s*LANG\s*=\s*([^}]*?)\s*\}\}/gi;

/** Una declaración tal como está escrita, con su posición. `legado`: `{{SCHEMA_ACT:…}}` o `{{LANG=…}}`. */
export interface DeclaracionSchema {
  clave: string;
  valor: string;
  desde: number;
  legado: boolean;
}

/** Lo que declara el esquema, ya interpretado. Lo no declarado (o mal escrito) queda vacío. */
export interface MetaSchema {
  act: string;
  actAlias: string;
  family: string;
  familyAlias: string;
  variant: string;
  groups: string[];
  lang: string;
}

/** Las declaraciones del texto, forma nueva y antigua, en orden. */
export function declaracionesSchema(texto: string): DeclaracionSchema[] {
  const out: DeclaracionSchema[] = [];
  if (!/SCHEMA|LANG/i.test(texto)) return out;
  for (const m of texto.matchAll(RE_DECLARACION)) out.push({ clave: m[1].toUpperCase(), valor: m[2].trim(), desde: m.index!, legado: false });
  for (const m of texto.matchAll(RE_SCHEMA_ACT)) out.push({ clave: 'ACT', valor: m[1].trim(), desde: m.index!, legado: true });
  for (const m of texto.matchAll(RE_LANG)) out.push({ clave: 'LANG', valor: m[1].trim(), desde: m.index!, legado: true });
  return out.sort((a, b) => a.desde - b.desde);
}

/** El problema de forma de un valor declarado, o `null` si está bien. */
export function problemaDeValor(clave: string, valor: string, legado = false): string | null {
  switch (clave) {
    case 'ACT': {
      const m = valor.match(ACT);
      if (!m || (legado && m[2])) return `SCHEMA:ACT «${valor}»: debe ser un código de acto IUI de cuatro cifras, con alias opcional (1103 ALIAS ADJUDICACION_HERENCIA)`;
      if (m[2] && !esAlias(m[2])) return `SCHEMA:ACT: el alias «${m[2]}» sólo admite mayúsculas sin tilde, cifras y guion bajo`;
      return null;
    }
    case 'FAMILY': {
      const m = valor.match(FAMILY);
      if (!m) return `SCHEMA:FAMILY «${valor}»: debe ser F y dos cifras, con alias opcional (F11 ALIAS HERENCIAS)`;
      if (m[2] && !esAlias(m[2])) return `SCHEMA:FAMILY: el alias «${m[2]}» sólo admite mayúsculas sin tilde, cifras y guion bajo`;
      return null;
    }
    case 'VARIANT':
      return NOMBRE_SCHEMA.test(valor) ? null : `SCHEMA:VARIANT «${valor}»: sólo mayúsculas sin tilde, cifras y guion bajo, un solo valor`;
    case 'GROUP': {
      const malos = valor.split(',').map((g) => g.trim()).filter((g) => !NOMBRE_SCHEMA.test(g));
      return malos.length ? `SCHEMA:GROUP: ${malos.map((g) => `«${g}»`).join(', ')} no vale: grupos separados por comas, en mayúsculas sin tilde, cifras y guion bajo` : null;
    }
    case 'LANG':
      return LANG_VALOR.test(valor) ? null : `SCHEMA:LANG «${valor}» no es un código de idioma (es, ca…)`;
    default:
      return `SCHEMA:${clave} no existe: las claves son ${CLAVES_SCHEMA.join(', ')}`;
  }
}

/** Los metadatos del texto: la PRIMERA declaración válida de cada clave. */
export function leerSchema(texto: string): MetaSchema {
  const meta: MetaSchema = { act: '', actAlias: '', family: '', familyAlias: '', variant: '', groups: [], lang: '' };
  const hechas = new Set<string>();
  for (const d of declaracionesSchema(texto)) {
    if (hechas.has(d.clave) || problemaDeValor(d.clave, d.valor, d.legado)) continue;
    hechas.add(d.clave);
    switch (d.clave) {
      case 'ACT': { const m = d.valor.match(ACT)!; meta.act = m[1]; meta.actAlias = m[2] ?? ''; break; }
      case 'FAMILY': { const m = d.valor.match(FAMILY)!; meta.family = m[1]; meta.familyAlias = m[2] ?? ''; break; }
      case 'VARIANT': meta.variant = d.valor; break;
      case 'GROUP': meta.groups = [...new Set(d.valor.split(',').map((g) => g.trim()))]; break;
      case 'LANG': meta.lang = d.valor.toLowerCase(); break;
    }
  }
  return meta;
}

// ---------------------------------------------------------------------------------------------------------------------
// Los valores: lo que viaja con los datos del caso
// ---------------------------------------------------------------------------------------------------------------------

/** La marca de que los metadatos ya van en los valores (aunque estén vacíos). */
export const MARCA_SCHEMA = 'SCHEMA:';

/**
 * Los metadatos como valores del motor. `idioma`: la lengua del documento que se escribe, si no es la declarada
 * (al traducir); sin ella, la declarada, y `es` si no declara ninguna.
 */
export function valoresDeSchema(texto: string, idioma?: string): Record<string, string> {
  const m = leerSchema(texto);
  return {
    [MARCA_SCHEMA]: '1',
    'SCHEMA:ACT': m.act,
    'SCHEMA:ACT:ALIAS': m.actAlias,
    'SCHEMA:FAMILY': m.family,
    'SCHEMA:FAMILY:ALIAS': m.familyAlias,
    'SCHEMA:VARIANT': m.variant,
    'SCHEMA:GROUP': m.groups.join(','),
    'SCHEMA:LANG': (idioma || m.lang || 'es').toLowerCase(),
  };
}

/** ¿Es una clave reservada de los metadatos (`SCHEMA:…`)? Nunca es un campo. */
export const esClaveSchema = (nombre: string): boolean => /^SCHEMA\s*:/i.test(nombre);

/** Los valores con los metadatos de `texto` encima, salvo que ya los traigan. Lo que diga el caso no los pisa. */
export function conValoresDeSchema<T extends Record<string, unknown>>(valores: T, texto: string, idioma?: string): T {
  if (MARCA_SCHEMA in valores) return valores;
  return { ...valores, ...valoresDeSchema(texto, idioma) };
}

const val = (v: Record<string, unknown>, k: string): string => {
  const x = v[k];
  return x === undefined || x === null ? '' : String(x);
};

/** ¿`literal` designa lo que vale la clave? ACT y FAMILY casan por código o alias; GROUP, por pertenencia. */
function casa(clave: string, literal: string, v: Record<string, unknown>): boolean {
  const l = literal.trim();
  switch (clave) {
    case 'ACT': case 'FAMILY': {
      const codigo = val(v, `SCHEMA:${clave}`);
      const alias = val(v, `SCHEMA:${clave}:ALIAS`);
      return !!l && (l.toUpperCase() === codigo.toUpperCase() || (!!alias && l.toUpperCase() === alias.toUpperCase()));
    }
    case 'GROUP':
      return !!l && val(v, 'SCHEMA:GROUP').split(',').some((g) => g && g.toUpperCase() === l.toUpperCase());
    case 'LANG':
      return l.toLowerCase() === val(v, 'SCHEMA:LANG').toLowerCase();
    default:
      return l === val(v, `SCHEMA:${clave}`);
  }
}

const COMILLAS = /^['"“”«»]+|['"“”«»]+$/g;
const ATOMO = /^SCHEMA\s*:\s*([A-Za-z_]\w*)\s*(?:(==|!=)\s*([\s\S]+?)|(NOT\s+)?IN\s*\(([\s\S]*)\))?\s*$/i;

/** Parte una lista de `IN (…)` por las comas que no van entre comillas. */
function partirLista(cuerpo: string): string[] {
  const out: string[] = [];
  let buf = '';
  let q: string | null = null;
  for (const c of cuerpo) {
    if (q) { buf += c; if (c === q || (q === '“' && c === '”') || (q === '«' && c === '»')) q = null; continue; }
    if ('\'"“«'.includes(c)) { q = c; buf += c; continue; }
    if (c === ',') { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);
  return out.map((x) => x.trim().replace(COMILLAS, '')).filter(Boolean);
}

/**
 * Un átomo de condición sobre los metadatos (`SCHEMA:GROUP == "X"`, `SCHEMA:ACT IN (…)`, `SCHEMA:VARIANT`), o `null`
 * si no lo es. Una clave desconocida o sin valor da falso en `==`/`IN` y cierto en `!=`/`NOT IN`.
 */
export function evaluarAtomoSchema(atomo: string, valores: Record<string, unknown>): boolean | null {
  const a = atomo.trim();
  if (!/^SCHEMA\s*:/i.test(a)) return null;
  const m = a.match(ATOMO);
  if (!m) return false;
  const clave = m[1].toUpperCase();
  if (m[2]) {
    const r = casa(clave, m[3].trim().replace(COMILLAS, ''), valores);
    return m[2] === '==' ? r : !r;
  }
  if (m[5] !== undefined) {
    const r = partirLista(m[5]).some((l) => casa(clave, l, valores));
    return m[4] ? !r : r;
  }
  return val(valores, `SCHEMA:${clave}`) !== '';
}

/** `{{SCHEMA:ACT}}` y demás lecturas impresas, sustituidas por su valor (GROUP, separados por coma y espacio). */
export function sustituirLecturasSchema(texto: string, valores: Record<string, unknown>): string {
  if (!texto.includes('SCHEMA')) return texto;
  RE_LECTURA.lastIndex = 0;
  return texto.replace(RE_LECTURA, (_t, k: string) => {
    const clave = k.toUpperCase();
    const v = val(valores, `SCHEMA:${clave}`);
    return clave === 'GROUP' ? v.split(',').filter(Boolean).join(', ') : v;
  });
}

/** Quita las declaraciones (`{{SCHEMA:X=…}}`): salen 0 caracteres, y la línea entera si iban solas en ella. */
export function quitarDeclaracionesSchema(texto: string): string {
  if (!texto.includes('SCHEMA')) return texto;
  return texto
    .replace(/^[ \t]*\{\{\s*SCHEMA\s*:\s*[A-Za-z_]\w*\s*=[^}]*\}\}[ \t]*\n/gim, '')
    .replace(/\{\{\s*SCHEMA\s*:\s*[A-Za-z_]\w*\s*=[^}]*\}\}/gi, '');
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que se compara: para el validador (E924) y para la auditoría de la biblioteca entera
// ---------------------------------------------------------------------------------------------------------------------

export interface ComparacionSchema { clave: string; literal: string }

/** Los literales con que las condiciones del texto comparan los metadatos (`SCHEMA:X == "…"`, `SCHEMA:X IN (…)`). */
export function comparacionesSchema(texto: string): ComparacionSchema[] {
  const out: ComparacionSchema[] = [];
  if (!texto.includes('SCHEMA')) return out;
  for (const c of texto.matchAll(/\{\{\s*(?:IF|ELSE)[_\s]+([^}]*)\}\}/gi)) {
    const cond = c[1];
    for (const m of cond.matchAll(/SCHEMA\s*:\s*([A-Za-z_]\w*)\s*(==|!=)\s*("[^"]*"|'[^']*'|“[^”]*”|«[^»]*»|[^\s()]+)/gi)) {
      out.push({ clave: m[1].toUpperCase(), literal: m[3].replace(COMILLAS, '').trim() });
    }
    for (const m of cond.matchAll(/SCHEMA\s*:\s*([A-Za-z_]\w*)\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/gi)) {
      for (const l of partirLista(m[2])) out.push({ clave: m[1].toUpperCase(), literal: l });
    }
  }
  return out;
}

/** Las claves que el texto LEE (en condiciones o impresas), para avisar de las desconocidas. */
export function clavesLeidas(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(/SCHEMA\s*:\s*([A-Za-z_]\w*)\b(?!\s*=[^=])/gi)) out.push(m[1].toUpperCase());
  return out;
}

/** ¿Tiene forma de algo que la clave puede valer? Para ACT, cuatro cifras o un alias; para FAMILY, F+2 o un alias. */
export function problemaDeLiteral(clave: string, literal: string): string | null {
  switch (clave) {
    case 'ACT':
      return /^[0-9]{4}$/.test(literal) || esAlias(literal) ? null
        : `SCHEMA:ACT se compara con «${literal}», que no es un código de cuatro cifras ni un alias (MAYÚSCULAS_SIN_TILDE)`;
    case 'FAMILY':
      return /^F[0-9]{2}$/.test(literal) || esAlias(literal) ? null
        : `SCHEMA:FAMILY se compara con «${literal}», que no es F y dos cifras ni un alias (MAYÚSCULAS_SIN_TILDE)`;
    case 'VARIANT': case 'GROUP':
      return NOMBRE_SCHEMA.test(literal) ? null
        : `SCHEMA:${clave} se compara con «${literal}»: sólo mayúsculas sin tilde, cifras y guion bajo`;
    case 'LANG':
      return LANG_VALOR.test(literal) ? null : `SCHEMA:LANG se compara con «${literal}», que no es un código de idioma`;
    default:
      return null;
  }
}
