// Instrucciones por campo: lo que se le dice a la IA de cada uno.
//
// Port de `extract_field_instructions` de `filler.py`. Dos orígenes:
//   · `{{CAMPO:[instrucción]}}` — campos sueltos, que el parser NO guarda.
//   · `{{DECLARE CAMPO [AS TIPO] :[instrucción] :OPTIONS(a,b)}}` — en cualquier
//     orden; se compone `[Tipo: X] instrucción` + la restricción de opciones.
//
// Los DECLARE con VALOR FIJO se saltan: no necesitan que la IA extraiga nada.

import { extractDeclareFixedValues } from '../compose/engine';
import type { ContextoCampos } from './conditional-only';

export function instruccionesDeCampo(
  plantilla: string,
  ctx: ContextoCampos,
): Record<string, string> {
  const salida: Record<string, string> = {};
  const esConocido = (n: string) =>
    ctx.camposDeSistema.has(n) || ctx.camposPredefinidos.has(n);

  // `{{CAMPO:[instrucción]}}`. Ojo: la clave puede salir como `DECLARE X`
  // cuando el campo es un DECLARE — es lo que hace el Python, y es inocuo
  // porque quien consulta lo hace por nombre de campo.
  for (const m of plantilla.matchAll(/\{\{([^:}]+):\[([^\]]+)\]\}\}/g)) {
    const nombre = m[1].trim();
    if (!esConocido(nombre)) salida[nombre] = m[2].trim();
  }

  const conValorFijo = extractDeclareFixedValues(plantilla);
  const reDeclare = /\{\{DECLARE\s+([\p{L}\p{N}_]+)(?:\s+AS\s+([\p{L}\p{N}_]+))?([^}]*)\}\}/giu;
  for (const m of plantilla.matchAll(reDeclare)) {
    const nombre = m[1].trim();
    if (Object.prototype.hasOwnProperty.call(conValorFijo, nombre)) continue;

    const tipo = (m[2] ?? '').trim();
    const cola = m[3] ?? '';
    const instr = /:\[([^\]]+)\]/.exec(cola)?.[1]?.trim() ?? '';
    const opts = /:OPTIONS\(([^)]*)\)/i.exec(cola)?.[1] ?? '';
    const opciones = opts.split(',').map((o) => o.trim()).filter(Boolean);

    if (!instr && opciones.length === 0) continue;

    const partes: string[] = [];
    if (tipo) partes.push(`[Tipo: ${tipo.toUpperCase()}]`);
    if (instr) partes.push(instr);
    if (opciones.length) {
      partes.push(
        'Debe responder EXACTAMENTE uno de los siguientes valores: ' + opciones.join(', '),
      );
    }
    salida[nombre] = partes.join(' ');
  }

  return salida;
}
