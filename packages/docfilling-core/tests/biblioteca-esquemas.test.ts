// Estado de los ESQUEMAS MAESTROS convertidos a markdown, pasados por el motor.
//
// Es la entrada de la tabla «constructo → dónde se resuelve» de F0.4: por cada
// esquema, qué campos pide, quién los rellena, qué INCLUDE no resuelve contra la
// biblioteca real y qué diagnósticos salen.
//
// No es un test de aserciones: es una MEDICIÓN, y se salta por defecto.
//
//   DOCFILLING_ESQUEMAS=<carpeta de .md convertidos> \
//   DOCFILLING_PARRAFOS=<.../_PROD/paragraphs> \
//   DOCFILLING_INFORME=/tmp/f04.txt npx vitest run tests/biblioteca-esquemas.test.ts
import { it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { esquemaDeCampos, expandirIncludes, repositorioDeMapa, validateText, QUIEN } from '../index';

const ESQUEMAS = process.env.DOCFILLING_ESQUEMAS;
const PARRAFOS = process.env.DOCFILLING_PARRAFOS;

function todos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) todos(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
}

it.skipIf(!ESQUEMAS || !PARRAFOS)('estado de los esquemas convertidos', async () => {
  const L: string[] = [];
  const log = (x: string) => L.push(x);

  // Biblioteca de párrafos, indexada por nombre (el repositorio normaliza NFC).
  const biblioteca = new Map<string, string>();
  for (const f of todos(PARRAFOS!)) {
    const nombre = f.split('/').pop()!.replace(/\.md$/, '');
    if (!biblioteca.has(nombre)) biblioteca.set(nombre, readFileSync(f, 'utf-8'));
  }
  const repo = repositorioDeMapa(biblioteca);

  const esquemas = todos(ESQUEMAS!);
  let campos = 0;
  let porIA = 0;
  let porPersona = 0;
  let porMotor = 0;
  let soloCond = 0;
  let errores = 0;
  let avisos = 0;
  let conFaltantes = 0;
  let conErrores = 0;
  const faltantes = new Map<string, number>();
  const codigos = new Map<string, number>();
  const peores: Array<{ f: string; falt: number; err: number; campos: number }> = [];

  for (const f of esquemas) {
    const texto = readFileSync(f, 'utf-8');
    const e = esquemaDeCampos(texto);
    const d = validateText(texto).diagnostics;
    const exp = await expandirIncludes(texto, repo);

    campos += e.campos.length;
    for (const c of e.campos) {
      if (c.quien === QUIEN.IA) porIA++;
      else if (c.quien === QUIEN.PERSONA) porPersona++;
      else porMotor++;
      if (c.soloCondicional) soloCond++;
    }
    const err = d.filter((x) => x.severity === 'error').length;
    errores += err;
    avisos += d.length - err;
    for (const x of d) codigos.set(x.code, (codigos.get(x.code) ?? 0) + 1);
    if (err) conErrores++;
    if (exp.faltantes.length) {
      conFaltantes++;
      for (const n of exp.faltantes) faltantes.set(n, (faltantes.get(n) ?? 0) + 1);
    }
    peores.push({ f: f.split('/').pop()!, falt: exp.faltantes.length, err, campos: e.campos.length });
  }

  log(`ESQUEMAS: ${esquemas.length} · biblioteca de párrafos: ${biblioteca.size} nombres`);
  log('');
  log(`campos declarados: ${campos} · los pide la IA: ${porIA} · una persona: ${porPersona} · el motor: ${porMotor}`);
  log(`de ellos solo-condicionales (no dejan la tarea incompleta): ${soloCond}`);
  log('');
  log(`esquemas con INCLUDE que no resuelven: ${conFaltantes}/${esquemas.length} · con errores de sintaxis: ${conErrores}`);
  log(`diagnósticos: ${errores} errores · ${avisos} avisos`);
  log(`por código: ${[...codigos.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  log('');
  log(`INCLUDE distintos que no resuelven: ${faltantes.size}`);
  for (const [n, c] of [...faltantes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    log(`   ${n} — lo piden ${c} esquemas`);
  }
  log('');
  log('los 10 esquemas con más INCLUDE sin resolver:');
  for (const p of peores.sort((a, b) => b.falt - a.falt).slice(0, 10)) {
    if (!p.falt) break;
    log(`   ${p.falt} faltantes · ${p.err} errores · ${p.campos} campos — ${p.f}`);
  }
  writeFileSync(process.env.DOCFILLING_INFORME!, L.join('\n') + '\n');
}, 300000);
