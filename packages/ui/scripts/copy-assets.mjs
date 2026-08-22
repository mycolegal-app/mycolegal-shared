// Copia los recursos no-TS (CSS + assets) al `dist` conservando su ruta
// relativa, para que:
//   - los consumidores resuelvan `@mycolegal-app/ui/tokens/*.css`,
//     `@mycolegal-app/ui/globals.css` contra el `dist` publicado, y
//   - los imports relativos de assets desde los componentes compilados
//     (dist/components/... → ../../assets/<x>.svg) sigan resolviendo.
// tsc no toca ficheros no-TS, así que esta copia los materializa en `dist`.
// Determinista (sin timestamps): usa cp recursivo idempotente.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgRoot, 'dist');

// (origen relativo al paquete, destino relativo a dist)
// Solo `assets`: los componentes compilados los importan por ruta relativa
// (dist/components/... → ../../assets/<x>.svg). `tokens/*.css` y `globals.css`
// se quedan en top-level (se publican vía package.json#files) porque
// postcss-import resuelve por ruta física y NO respeta el `exports` map.
const entries = [
  ['assets', 'assets'],
];

for (const [src, dest] of entries) {
  const from = join(pkgRoot, src);
  if (!existsSync(from)) continue;
  const to = join(dist, dest);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-assets] ${src} → dist/${dest}`);
}
