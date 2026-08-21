#!/usr/bin/env node
// tools/affected.mjs — dado un conjunto de ficheros cambiados en los paquetes
// compartidos, calcula qué apps consumidoras están REALMENTE afectadas.
//
// Modelo: grafo de módulos intra-paquete + mapa símbolo→módulo del barrel de ui.
// Afectada ⇔ (algún módulo que la app usa) depende transitivamente de un módulo cambiado.
// Reglas conservadoras: dynamic/namespace/símbolo desconocido/parse-fail/canal CSS → afecta.
//
// Uso:
//   node tools/affected.mjs --changed packages/ui/lib/utils.ts[,otro,...]
//   node tools/affected.mjs --since <gitref>            (diff dentro del monorepo)
//   node tools/affected.mjs --changed ... --json        (salida máquina)
//
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve, extname, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const MONO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPS_ROOT = resolve(MONO, '..');
const PKG_DIRS = { ui: join(MONO, 'packages/ui'), sharedlib: join(MONO, 'packages/sharedlib'), 'text-extract': join(MONO, 'packages/text-extract') };
const PKG_NAME = { ui: '@mycolegal-app/ui', sharedlib: '@mycolegal-app/sharedlib', 'text-extract': '@mycolegal-app/text-extract' };
const NAME_TO_PKG = { '@mycolegal-app/ui': 'ui', '@mycolegal-app/sharedlib': 'sharedlib', '@mycolegal-app/text-extract': 'text-extract' };
const PKG_KEYS = ['ui', 'sharedlib', 'text-extract'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '.turbo']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// ---------- args ----------
const args = process.argv.slice(2);
const getArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const asJson = args.includes('--json');
const verbose = args.includes('-v') || args.includes('--verbose');

// ---------- fs helpers ----------
function walk(dir, acc = []) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
function isFile(p) { try { return statSync(p).isFile(); } catch { return false; } }

// Resolve a specifier to an on-disk module file (relative to fromFileDir).
function resolveFrom(fromDir, spec) {
  const base = resolve(fromDir, spec);
  const cands = [];
  const ext = extname(base);
  if (ext) cands.push(base);
  for (const e of ['.ts', '.tsx', '.d.ts', '.js', '.jsx']) cands.push(base + e);
  cands.push(base + '.css', base + '.json');
  for (const e of ['.ts', '.tsx', '.d.ts', '.js', '.jsx']) cands.push(join(base, 'index' + e));
  for (const c of cands) if (isFile(c)) return c;
  return null;
}
// Resolve a package subpath (e.g. 'server/admin') to a module in that pkg.
function resolveEntry(pkg, sub) { return resolveFrom(PKG_DIRS[pkg], './' + sub); }

// ---------- TS import extraction ----------
function parseImports(file, text) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  function pushDecl(spec, clause) {
    let star = false, named = [], sideEffect = false;
    if (!clause) sideEffect = true;
    else {
      if (clause.name) star = true; // default import → treat as whole (conservative)
      const nb = clause.namedBindings;
      if (nb) {
        if (ts.isNamespaceImport(nb)) star = true;
        // usar el nombre de ORIGEN (propertyName) para `X as Y`, no el local
        else if (ts.isNamedImports(nb)) named = nb.elements.map((el) => (el.propertyName ?? el.name).text);
      }
    }
    out.push({ spec, star, named, sideEffect, dynamic: false });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      pushDecl(node.moduleSpecifier.text, node.importClause);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      let star = false, named = [], exportedNames = [];
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        named = node.exportClause.elements.map((el) => (el.propertyName ?? el.name).text);      // origen (consumido del paquete)
        exportedNames = node.exportClause.elements.map((el) => el.name.text);                    // nombre expuesto (para el mapa del barrel)
      } else star = true; // export * from
      out.push({ spec: node.moduleSpecifier.text, star, named, exportedNames, exportFrom: true, dynamic: false });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = node.arguments[0];
      if (a && ts.isStringLiteral(a)) out.push({ spec: a.text, star: true, named: [], dynamic: true });
      else out.push({ spec: null, star: true, named: [], dynamic: true, unresolved: true });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}
// Lightweight regex extraction for .astro (frontmatter imports) — subpath only.
function parseImportsRegex(text) {
  const out = [];
  const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
  let m; while ((m = re.exec(text))) { const spec = m[1] || m[2]; if (spec) out.push({ spec, star: false, named: [], dynamic: false }); }
  return out;
}

// ================= build package module graph =================
const fwd = new Map();   // module -> Set(modules it imports)  (intra-pkg)
const rev = new Map();   // module -> Set(modules that import it)
const allModules = new Set();
function addEdge(from, to) {
  if (from === to) return;
  if (!fwd.has(from)) fwd.set(from, new Set());
  if (!rev.has(to)) rev.set(to, new Set());
  fwd.get(from).add(to); rev.get(to).add(from);
}
const pkgFiles = { ui: [], sharedlib: [], 'text-extract': [] };
for (const pkg of PKG_KEYS) {
  for (const f of walk(PKG_DIRS[pkg])) {
    if (!CODE_EXT.has(extname(f)) && extname(f) !== '.css') continue;
    pkgFiles[pkg].push(f); allModules.add(f);
  }
}
for (const pkg of PKG_KEYS) {
  for (const f of pkgFiles[pkg]) {
    if (extname(f) === '.css') continue;
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    if (!/(?:import|export|require)/.test(text)) continue;
    let imps; try { imps = parseImports(f, text); } catch { continue; }
    for (const imp of imps) {
      if (!imp.spec) continue;
      if (imp.spec.startsWith('.')) {
        const tgt = resolveFrom(dirname(f), imp.spec);
        if (tgt && PKG_KEYS.some((k) => tgt.startsWith(PKG_DIRS[k]))) addEdge(f, tgt);
      } else if (NAME_TO_PKG[imp.spec.split('/').slice(0, 2).join('/')]) {
        // cross-package import by name (e.g. ui importing sharedlib subpath)
        const op = imp.spec.split('/').slice(0, 2).join('/');
        const sub = imp.spec.slice(op.length + 1);
        const tgt = sub ? resolveEntry(NAME_TO_PKG[op], sub) : null;
        if (tgt) addEdge(f, tgt);
      }
    }
  }
}

// ================= parse ui barrel (index.ts) symbol -> module =================
const barrelIndex = resolveEntry('ui', 'index');
const barrelSymbol = new Map();  // exported name -> module file
const barrelWildcards = [];      // export * from -> module file
if (barrelIndex) {
  const text = readFileSync(barrelIndex, 'utf8');
  for (const imp of parseImports(barrelIndex, text)) {
    if (!imp.exportFrom || !imp.spec || !imp.spec.startsWith('.')) continue;
    const tgt = resolveFrom(dirname(barrelIndex), imp.spec);
    if (!tgt) continue;
    if (imp.star) barrelWildcards.push(tgt);
    else for (const n of imp.exportedNames) barrelSymbol.set(n, tgt);
  }
}

// ================= compute changed set =================
function normalizeChanged(list) {
  const mods = new Set();
  for (let raw of list) {
    raw = raw.trim(); if (!raw) continue;
    let abs = raw.startsWith('/') ? raw : join(MONO, raw);
    if (isFile(abs)) { mods.add(abs); continue; }
    // try resolving as a module (extensionless)
    const r = resolveFrom(dirname(abs), './' + (extname(abs) ? '' : '') + require('path').basename(abs));
    if (r) mods.add(r); else console.error(`  [aviso] no encontrado: ${raw}`);
  }
  return mods;
}
let changedList = [];
const since = getArg('--since');
if (since) {
  const scope = getArg('--scope') || 'packages/';   // acotar el diff a un paquete concreto
  const out = execSync(`git -C "${MONO}" diff --name-only ${since}..HEAD -- ${scope}`, { encoding: 'utf8' });
  changedList = out.split('\n').filter(Boolean).map((p) => join(MONO, p));
} else {
  const c = getArg('--changed');
  if (!c) { console.error('Falta --changed <paths> o --since <ref>'); process.exit(2); }
  changedList = c.split(',');
}
const changed = new Set();
for (let p of changedList) { p = p.trim(); if (!p) continue; const abs = p.startsWith('/') ? p : join(MONO, p); if (isFile(abs)) changed.add(abs); else console.error(`  [aviso] fichero cambiado no existe (¿borrado?): ${p} → lo trato como cambio`); if (!isFile(abs)) changed.add(abs); }

// reverse-transitive closure: todos los módulos que (transitivamente) importan un módulo cambiado
const reverseClosure = new Set();
{ const stack = [...changed]; for (const m of changed) reverseClosure.add(m);
  while (stack.length) { const m = stack.pop(); const importers = rev.get(m); if (!importers) continue; for (const im of importers) if (!reverseClosure.has(im)) { reverseClosure.add(im); stack.push(im); } } }

// canales especiales
const changedArr = [...changed];
const inUi = (f) => f.startsWith(PKG_DIRS.ui);
const broadCssChannel = changedArr.some((f) => inUi(f) && (/\/tokens\//.test(f) || /\/tailwind-preset\.ts$/.test(f) || /\/globals\.css$/.test(f)));
const barrelChanged = barrelIndex && changed.has(barrelIndex);
const e2eOnly = (f) => inUi(f) && /\/e2e\//.test(f);
const allChangedAreE2e = changedArr.length > 0 && changedArr.every(e2eOnly);

// ================= discover consumer apps =================
function consumerApps() {
  const apps = [];
  for (const e of readdirSync(APPS_ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || !/^mycolegal-/.test(e.name)) continue;
    if (['mycolegal-shared', 'mycolegal-ui', 'mycolegal-sharedlib'].includes(e.name)) continue;
    const pj = join(APPS_ROOT, e.name, 'package.json');
    if (!isFile(pj)) continue;
    let deps = {}; try { const j = JSON.parse(readFileSync(pj, 'utf8')); deps = { ...j.dependencies, ...j.devDependencies }; } catch { continue; }
    const usesUi = !!deps[PKG_NAME.ui]; const usesSl = !!deps[PKG_NAME.sharedlib]; const usesTe = !!deps[PKG_NAME['text-extract']];
    if (!usesUi && !usesSl && !usesTe) continue;
    apps.push({ name: e.name, dir: join(APPS_ROOT, e.name), usesUi, usesSl, usesTe });
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

// ================= analyze one app =================
function analyzeApp(app) {
  const srcDir = join(app.dir, 'src');
  const files = (existsSync(srcDir) ? walk(srcDir) : walk(app.dir))
    .filter((f) => ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro'].includes(extname(f)));
  const used = new Set();        // package module files this app depends on (entrypoints)
  let usesBarrel = false, wholeBarrel = false, wholePkg = false;
  const reasons = new Set();
  for (const f of files) {
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    if (!text.includes('@mycolegal-app/')) continue;
    let imps; try { imps = extname(f) === '.astro' ? parseImportsRegex(text) : parseImports(f, text); } catch { wholePkg = true; reasons.add('parse-fail'); continue; }
    for (const imp of imps) {
      if (!imp.spec) { if (imp.dynamic) { wholePkg = true; reasons.add('dynamic-import'); } continue; }
      const head = imp.spec.split('/').slice(0, 2).join('/');
      const pkg = NAME_TO_PKG[head]; if (!pkg) continue;
      const sub = imp.spec.slice(head.length + 1); // '' for barrel
      if (sub === '') {
        // barrel import
        if (pkg === 'sharedlib') { wholePkg = true; reasons.add('sharedlib-barrel'); continue; }
        if (pkg === 'text-extract') { wholePkg = true; reasons.add('text-extract-barrel'); continue; }
        usesBarrel = true;
        if (imp.star || imp.dynamic) { wholeBarrel = true; reasons.add('barrel-namespace/dynamic'); }
        else for (const n of imp.named) { const m = barrelSymbol.get(n); if (m) used.add(m); else { wholeBarrel = true; reasons.add(`barrel-unknown:${n}`); } }
      } else {
        if (pkg === 'ui' && sub.startsWith('e2e/')) continue; // no se envía
        const m = resolveEntry(pkg, sub);
        if (m) used.add(m); else { wholePkg = true; reasons.add(`unresolved-subpath:${pkg}/${sub}`); }
      }
    }
  }
  // wholeBarrel → depende de todos los módulos reexportados por el barrel (+ wildcards)
  if (wholeBarrel) { for (const m of barrelSymbol.values()) used.add(m); for (const m of barrelWildcards) used.add(m); }

  // ---- decidir afectada ----
  const hits = [];
  if (allChangedAreE2e) return { app, affected: false, reason: 'solo e2e (no se envía)', used: used.size };
  if (broadCssChannel && app.usesUi) return { app, affected: true, reason: 'canal CSS/tokens/preset (afecta a todo consumidor de ui)', used: used.size };
  if (barrelChanged && usesBarrel) return { app, affected: true, reason: 'cambió el barrel index.ts y la app lo importa', used: used.size };
  if (wholePkg) { // conservador: usa el paquete de forma irresoluble → afectada si hubo cualquier cambio en ese pkg
    const anyUi = changedArr.some(inUi), anySl = changedArr.some((f) => f.startsWith(PKG_DIRS.sharedlib)), anyTe = changedArr.some((f) => f.startsWith(PKG_DIRS['text-extract']));
    if ((app.usesUi && anyUi) || (app.usesSl && anySl) || (app.usesTe && anyTe)) return { app, affected: true, reason: `uso irresoluble (${[...reasons].join(', ')})`, used: used.size };
  }
  for (const m of used) if (reverseClosure.has(m)) hits.push(m);
  return { app, affected: hits.length > 0, reason: hits.length ? `usa ${hits.length} entrypoint(s) afectado(s)` : 'sin solape', used: used.size, hits, flags: [...reasons], wholeBarrel, wholePkg };
}

// ================= run =================
const apps = consumerApps();
const results = apps.map(analyzeApp);
const affected = results.filter((r) => r.affected);

if (asJson) {
  console.log(JSON.stringify({ changed: changedArr.map((f) => relative(MONO, f)), affected: affected.map((r) => r.app.name), results: results.map((r) => ({ app: r.app.name, affected: r.affected, reason: r.reason })) }, null, 2));
} else {
  console.log(`\n  Cambios: ${changedArr.map((f) => relative(MONO, f)).join(', ')}`);
  console.log(`  Módulos en cierre reverso (afectados dentro del paquete): ${reverseClosure.size}`);
  if (broadCssChannel) console.log(`  ⚠ canal CSS/tokens/preset → afecta a TODO consumidor de ui`);
  if (barrelChanged) console.log(`  ⚠ cambió el barrel index.ts`);
  if (allChangedAreE2e) console.log(`  ✓ cambios solo en e2e → 0 apps afectadas`);
  console.log(`\n  ${'APP'.padEnd(28)} ¿AFECTADA?  motivo`);
  console.log('  ' + '─'.repeat(72));
  for (const r of results) {
    const fl = verbose && r.flags?.length ? `  [${r.flags.join(', ')}]` : '';
    console.log(`  ${r.app.name.padEnd(28)} ${(r.affected ? 'SÍ' : 'no').padEnd(10)} ${r.reason}${fl}${verbose && r.hits?.length ? '\n      ' + r.hits.map((h) => relative(MONO, h)).join('\n      ') : ''}`);
  }
  console.log('  ' + '─'.repeat(72));
  console.log(`  AFECTADAS: ${affected.length}/${results.length}  →  ${affected.map((r) => r.app.name).join(', ') || '(ninguna)'}\n`);
}
