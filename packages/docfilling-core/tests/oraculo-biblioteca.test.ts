// Registro de divergencias contra el motor Python, sobre la biblioteca real.
//
// QUÉ ES ESTO AHORA (cambió el 2-oct-2026, D25 del plan)
//
// Ya **no preservamos la paridad**: `docfilling-core` evoluciona libre y el SaaS
// se alineará después con lo que concluyamos aquí. Así que este test dejó de ser
// una puerta («si difieres, arréglate») y pasó a ser un **registro**: cada
// divergencia tiene que estar en la lista de abajo, explicada y querida. Falla
// sólo si aparece una que nadie ha decidido.
//
// Depende de ficheros que no están en el repo, así que se salta por defecto:
//   DOCFILLING_ORACULO=<volcado json del Python> npx vitest run tests/oraculo-biblioteca.test.ts
//
// Medición del 2-oct-2026 sobre 1.727 ficheros: 1.718 idénticos, 9 divergencias,
// todas de las tres clases registradas.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateText } from '../index';

const ORACULO = process.env.DOCFILLING_ORACULO;

type Tupla = [number, number, string, string];
const clave = (t: Tupla) => `${t[0]}:${t[1]}:${t[2]}:${t[3]}`;
/** Firma sin la línea: para reconocer «lo mismo, en otro sitio». */
const firma = (t: Tupla) => `${t[2]}:${t[3]}:${t[1]}`;

/** Las divergencias que hemos decidido tener. */
const DELIBERADAS = [
  {
    nombre: 'posiciones desplazadas por los comentarios // (error del Python)',
    // El Python quita las líneas `//` y luego informa de posiciones medidas
    // sobre el texto ya sin comentarios, así que señala una línea que no
    // existe en el fichero. El nuestro da la del fichero real, que es la que
    // sirve en el margen del editor.
    aplica: (py: Tupla[], ts: Tupla[], texto: string) =>
      texto.split('\n').some((l) => l.trimStart().startsWith('//')) &&
      py.map(firma).sort().join('|') === ts.map(firma).sort().join('|'),
  },
  {
    nombre: 'E051 que ya no emitimos: aceptamos sinónimos de tipo (A8)',
    // BOOLEAN→BOOL, NUMBER→NUM, STRING→TEXT, LIST→TEXT. 4 ficheros de la biblioteca.
    aplica: (py: Tupla[], ts: Tupla[]) => {
      const soloPy = py.filter((p) => !ts.some((t) => clave(t) === clave(p)));
      return soloPy.length > 0 && soloPy.every((p) => p[2] === 'E051');
    },
  },
  {
    nombre: 'diagnósticos nuestros que el Python no tiene (rango W9xx/E9xx)',
    aplica: (py: Tupla[], ts: Tupla[]) => {
      const soloTs = ts.filter((t) => !py.some((p) => clave(p) === clave(t)));
      return soloTs.length > 0 && soloTs.every((t) => /^[EW]9\d\d$/.test(t[2]));
    },
  },
];

describe.skipIf(!ORACULO)('registro de divergencias · biblioteca real', () => {
  it('toda divergencia con el Python está registrada y explicada', () => {
    const { res } = JSON.parse(readFileSync(ORACULO!, 'utf-8')) as {
      res: Record<string, Tupla[]>;
    };
    const cuenta = new Map<string, number>();
    const inesperadas: string[] = [];
    let comparados = 0;
    let identicos = 0;

    for (const [f, py] of Object.entries(res)) {
      let texto: string;
      try {
        texto = readFileSync(f, 'utf-8');
      } catch {
        continue;
      }
      comparados++;
      const ts = validateText(texto).diagnostics.map(
        (d) => [d.line, d.col, d.code, d.severity] as Tupla,
      );
      if (ts.map(clave).sort().join('|') === py.map(clave).sort().join('|')) {
        identicos++;
        continue;
      }

      // Se admiten varias clases a la vez en un mismo fichero: se van quitando
      // las que explican algo hasta ver si queda residuo.
      const explicada = DELIBERADAS.filter((d) => d.aplica(py, ts, texto));
      if (explicada.length > 0) {
        for (const d of explicada) cuenta.set(d.nombre, (cuenta.get(d.nombre) ?? 0) + 1);
        continue;
      }
      inesperadas.push(
        `${f.split('/').slice(-2).join('/')}\n      py: ${py.map(clave).sort().join(' ')}\n      ts: ${ts.map(clave).sort().join(' ')}`,
      );
    }

    console.log(`biblioteca: ${comparados} ficheros · idénticos: ${identicos}`);
    for (const [n, c] of cuenta) console.log(`  divergencia registrada · ${n}: ${c} ficheros`);
    for (const d of inesperadas.slice(0, 8)) console.log('  ⚠️ INESPERADA ' + d);
    expect(inesperadas).toEqual([]);
  }, 120000);
});
