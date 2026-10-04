// Oráculo de F1.5 sobre la biblioteca real: compara `camposSoloCondicionales` e
// `instruccionesDeCampo` con los mismos cálculos del Python
// (`identify_conditional_only_fields` / `extract_field_instructions` de
// `filler.py`) sobre los ~1.700 markdown de `_PROD`.
//
// Importa porque `soloCondicional` es **el criterio con el que el procesado
// decide si una tarea está completa**: si se desvía, la frontera pedirá datos
// que no hacen falta o dejará de pedir los que sí.
//
//   DOCFILLING_ORACULO_CAMPOS=<json> npx vitest run tests/oraculo-campos.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { camposSoloCondicionales, instruccionesDeCampo } from '../index';

const ORACULO = process.env.DOCFILLING_ORACULO_CAMPOS;

describe.skipIf(!ORACULO)('oráculo · campos sobre la biblioteca real', () => {
  it('conditional-only e instrucciones coinciden con el Python', () => {
    const { sys, res } = JSON.parse(readFileSync(ORACULO!, 'utf-8')) as {
      sys: string[];
      res: Record<string, { cond: string[]; instr: Record<string, string> }>;
    };
    const ctx = {
      camposDeSistema: new Set(sys),
      camposPredefinidos: new Set<string>(),
    };

    const difCond: string[] = [];
    const difInstr: string[] = [];
    let comparados = 0;

    const normaliza = (o: Record<string, string>) =>
      Object.keys(o)
        .sort()
        .map((k) => `${k}=${o[k]}`)
        .join(' ~ ');

    for (const [f, esperado] of Object.entries(res)) {
      let texto: string;
      try {
        texto = readFileSync(f, 'utf-8');
      } catch {
        continue;
      }
      comparados++;

      const cond = [...camposSoloCondicionales(texto, ctx)].sort();
      if (cond.join('|') !== [...esperado.cond].sort().join('|')) {
        difCond.push(
          `${f.split('/').pop()} · py: ${esperado.cond.join(' ')} · ts: ${cond.join(' ')}`,
        );
      }

      const instr = instruccionesDeCampo(texto, ctx);
      if (normaliza(instr) !== normaliza(esperado.instr)) {
        const soloPy = Object.keys(esperado.instr).filter((k) => !(k in instr));
        const soloTs = Object.keys(instr).filter((k) => !(k in esperado.instr));
        const distintos = Object.keys(instr).filter(
          (k) => k in esperado.instr && instr[k] !== esperado.instr[k],
        );
        difInstr.push(
          `${f.split('/').pop()} · sólo py: [${soloPy}] · sólo ts: [${soloTs}] · distintos: [${distintos}]`,
        );
      }
    }

    console.log(
      `campos: ${comparados} ficheros · difieren cond-only: ${difCond.length} · difieren instrucciones: ${difInstr.length}`,
    );
    for (const d of difCond.slice(0, 6)) console.log('    ' + d);
    for (const d of difInstr.slice(0, 6)) console.log('    ' + d);
    expect({ cond: difCond.length, instr: difInstr.length }).toEqual({ cond: 0, instr: 0 });
  }, 180000);
});
