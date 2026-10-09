// Esquema de campos sobre el BIBLIOTECA REAL del Drive `_PROD`.
//
// No es un test de aserciones: es una MEDICIÓN. Se salta por defecto porque
// depende de ficheros que no están en el repo:
//
//   DOCFILLING_BIBLIOTECA="<.../_PROD>" DOCFILLING_INFORME=/tmp/e.txt \
//     npx vitest run tests/biblioteca-schema.test.ts && cat /tmp/e.txt
import { it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { esquemaDeCampos } from '../index';

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

it.skipIf(!RAIZ)('esquema de campos sobre la biblioteca real', () => {
  const L: string[] = [];
  const log = (x: string) => L.push(x);
  const ficheros = todos(RAIZ!);

  let totalCampos = 0;
  const porQuien = new Map<string, number>();
  const porTipo = new Map<string, number>();
  const porCategoria = new Map<string, number>();
  let soloCondicionales = 0;
  let conInstruccion = 0;
  let conOpciones = 0;
  let conIui = 0;
  let arrays = 0;
  let conSubcampos = 0;
  let accionesHumanas = 0;
  let maxCampos = 0;
  let ficheroMax = '';
  let fallos = 0;

  const cuenta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const f of ficheros) {
    let e;
    try {
      e = esquemaDeCampos(readFileSync(f, 'utf-8'));
    } catch {
      fallos++;
      continue;
    }
    totalCampos += e.campos.length;
    if (e.campos.length > maxCampos) {
      maxCampos = e.campos.length;
      ficheroMax = f;
    }
    accionesHumanas += e.accionesHumanas.init.length + e.accionesHumanas.pre.length + e.accionesHumanas.post.length;
    for (const c of e.campos) {
      cuenta(porQuien, c.quien);
      cuenta(porTipo, c.tipo);
      cuenta(porCategoria, c.categoria);
      if (c.soloCondicional) soloCondicionales++;
      if (c.instruccion) conInstruccion++;
      if (c.opciones.length) conOpciones++;
      if (c.req.length) conIui++;
      if (c.esArray) arrays++;
      if (c.subcampos.length) conSubcampos++;
    }
  }

  const pct = (n: number) => `${((n / totalCampos) * 100).toFixed(1)} %`;
  log(`ficheros: ${ficheros.length} · fallos al derivar el esquema: ${fallos}`);
  log(`campos totales: ${totalCampos} · máximo en un fichero: ${maxCampos} (${ficheroMax.split('/').pop()})`);
  log(`quién lo rellena: ${[...porQuien.entries()].map(([k, v]) => `${k}=${v} (${pct(v)})`).join(' · ')}`);
  log(`por tipo: ${[...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  log(`por categoría: ${[...porCategoria.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  log(`soloCondicional: ${soloCondicionales} (${pct(soloCondicionales)}) — no dejan la tarea incompleta`);
  log(`con instrucción para la IA: ${conInstruccion} (${pct(conInstruccion)}) · con opciones: ${conOpciones} · con :REQ: ${conIui}`);
  log(`arrays: ${arrays} · de ellos con subcampos declarados: ${conSubcampos}`);
  log(`acciones humanas declaradas: ${accionesHumanas}`);
  writeFileSync(process.env.DOCFILLING_INFORME!, L.join('\n') + '\n');
}, 180000);
