// Expansión de INCLUDE contra la BIBLIOTECA REAL del Drive `_PROD`.
//
// No es un test de aserciones: es una MEDICIÓN. Se salta por defecto porque
// depende de ficheros que no están en el repo; se corre a mano cuando se quiere
// saber el estado de la biblioteca:
//
//   DOCFILLING_BIBLIOTECA="<.../_PROD>" DOCFILLING_INFORME=/tmp/i.txt \
//     npx vitest run tests/biblioteca-includes.test.ts && cat /tmp/i.txt
//
// Medición del 2-oct-2026: 1.727 ficheros · 1.651 nombres únicos · 76 nombres
// REPETIDOS (los INCLUDE se resuelven por nombre: el catálogo tiene que decidir
// qué hacer con eso) · 449 ficheros con INCLUDE → 387 expanden limpios, 61 con
// faltantes, 1 con ciclo · 54 nombres distintos no resuelven, el más pedido
// FISCALIDAD_CCAA en 40 ficheros.
import { it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';

const RAIZ = process.env.DOCFILLING_BIBLIOTECA;

function todos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) todos(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
}

it.skipIf(!RAIZ)('expansión sobre la biblioteca real', async () => {
  const L: string[] = [];
  const log = (x: string) => L.push(x);

  const ficheros = todos(RAIZ!);
  const mapa = new Map<string, string>();
  let colisiones = 0;
  for (const f of ficheros) {
    const nombre = f.split('/').pop()!.replace(/\.md$/, '');
    if (mapa.has(nombre)) colisiones++;
    else mapa.set(nombre, readFileSync(f, 'utf-8'));
  }
  const repo = repositorioDeMapa(mapa);

  let conIncludes = 0, limpios = 0, conFaltantes = 0, conCiclos = 0;
  const faltantesTotales = new Map<string, number>();
  const ciclosVistos = new Set<string>();
  let maxUsados = 0, ficheroMax = '';

  for (const f of ficheros) {
    const texto = readFileSync(f, 'utf-8');
    if (!/\{\{\s*INCLUDE/i.test(texto)) continue;
    conIncludes++;
    const r = await expandirIncludes(texto, repo);
    if (r.usados.length > maxUsados) { maxUsados = r.usados.length; ficheroMax = f; }
    if (r.ciclos.length) { conCiclos++; r.ciclos.forEach((c) => ciclosVistos.add(c)); }
    if (r.faltantes.length) {
      conFaltantes++;
      for (const n of r.faltantes) faltantesTotales.set(n, (faltantesTotales.get(n) ?? 0) + 1);
    }
    if (!r.faltantes.length && !r.ciclos.length) limpios++;
  }

  log(`biblioteca: ${ficheros.length} ficheros .md · ${mapa.size} nombres únicos · ${colisiones} nombres repetidos`);
  log(`con INCLUDE: ${conIncludes} · expanden limpios: ${limpios} · con faltantes: ${conFaltantes} · con ciclos: ${conCiclos}`);
  log(`INCLUDE distintos que no resuelven: ${faltantesTotales.size}`);
  for (const [n, c] of [...faltantesTotales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    log(`   ${n} — lo piden ${c} ficheros`);
  }
  if (ciclosVistos.size) log(`ciclos: ${[...ciclosVistos].slice(0, 6).join(' | ')}`);
  log(`más párrafos insertados en uno: ${maxUsados} (${ficheroMax.split('/').pop()})`);
  writeFileSync(process.env.DOCFILLING_INFORME!, L.join('\n') + '\n');
}, 180000);
