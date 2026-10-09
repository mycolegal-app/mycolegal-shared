// Peso de cada condición: cuánto texto decide y cuántas otras condiciones deja sin efecto.
//
// Redactor pregunta primero la condición que más decide (DC6 del plan REQ_CATALOGO_IUI).
// Hasta ahora el orden era la posición en el documento, y una compraventa empezaba por lo que
// tocase arriba en vez de por la comunidad autónoma de la finca, que tumba 31 condiciones
// fiscales de golpe.
//
// Es un cálculo ESTÁTICO sobre el esquema expandido (DR8): no depende de la tarea, así que la
// app lo hace una vez por huella del esquema.
//
// - `caracteres`: texto visible (fuera de `{{…}}`) de los bloques `IF` en que aparece la
//   condición, contando sólo el más externo: un bloque dentro de otro gobernado por la misma
//   condición ya está contado en el de fuera.
// - `tumba`: las otras condiciones que aparecen dentro de esos bloques. Si la condición sale
//   del otro lado, ésas ya no hay que preguntarlas.

import { FIELD_PATTERN } from '../syntax/constants';
import { extractIfFieldRefs } from '../syntax/validator';
import { normalizeConditionals } from '../compose/engine';

export interface PesoCondicion {
  caracteres: number;
  /** Bloques `IF` que cuenta (los más externos para esta condición). */
  bloques: number;
  /** Condiciones que aparecen dentro de sus bloques. */
  tumba: string[];
}

/** Puntos por cada condición que tumba, en caracteres equivalentes. */
export const PUNTOS_POR_CONDICION_TUMBADA = 200;

/** Una cifra para ordenar: el texto que decide más un plus por cada condición que tumba. */
export function puntuacion(p: PesoCondicion | undefined): number {
  if (!p) return 0;
  return p.caracteres + PUNTOS_POR_CONDICION_TUMBADA * p.tumba.length;
}

function referencias(expr: string): string[] {
  return extractIfFieldRefs(`IF ${expr}`)
    .filter((r) => !/^SYSTEM:/i.test(r) && r.toUpperCase() !== 'COUNT');
}

export function pesoDeCondiciones(texto: string): Map<string, PesoCondicion> {
  const t = normalizeConditionals(texto);

  // Prefijo de caracteres visibles: lo que está dentro de `{{…}}` no cuenta.
  const visible = new Int32Array(t.length + 1);
  const dentro = new Uint8Array(t.length);
  for (const m of t.matchAll(new RegExp(FIELD_PATTERN.source, 'g'))) {
    dentro.fill(1, m.index!, m.index! + m[0].length);
  }
  for (let i = 0; i < t.length; i++) visible[i + 1] = visible[i] + (dentro[i] ? 0 : 1);
  const vis = (a: number, b: number) => (b > a ? visible[b] - visible[a] : 0);

  interface Marco { vars: string[]; inicio: number; anidadas: Set<string> }
  const pila: Marco[] = [];
  const pesos = new Map<string, { caracteres: number; bloques: number; tumba: Set<string> }>();

  const cerrar = (m: Marco, fin: number) => {
    const span = vis(m.inicio, fin);
    for (const v of m.vars) {
      // Sólo el bloque más externo de esta condición.
      if (pila.some((p) => p.vars.includes(v))) continue;
      const p = pesos.get(v) ?? { caracteres: 0, bloques: 0, tumba: new Set<string>() };
      p.caracteres += span;
      p.bloques += 1;
      for (const n of m.anidadas) if (n !== v) p.tumba.add(n);
      pesos.set(v, p);
    }
  };

  for (const m of t.matchAll(/\{\{(?:IF\s+([^}]+)|ENDIF)\}\}/g)) {
    if (m[1] !== undefined) {
      const vars = [...new Set(referencias(m[1]))];
      for (const p of pila) for (const v of vars) p.anidadas.add(v);
      pila.push({ vars, inicio: m.index! + m[0].length, anidadas: new Set() });
    } else {
      const marco = pila.pop();
      if (marco) cerrar(marco, m.index!);
    }
  }
  // IF sin cerrar: hasta el final del texto (el validador ya avisa con E010).
  while (pila.length) cerrar(pila.pop()!, t.length);

  const out = new Map<string, PesoCondicion>();
  for (const [v, p] of pesos) out.set(v, { caracteres: p.caracteres, bloques: p.bloques, tumba: [...p.tumba].sort() });
  return out;
}
