// Un `{{INCLUDE}}` en una línea `//` está retirado: ni se expande ni cuenta como faltante.
import { describe, it, expect } from 'vitest';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';

const repo = repositorioDeMapa({ PARR_A: 'texto A' });

describe('expandirIncludes · líneas comentadas', () => {
  it('no cuenta como faltante un INCLUDE comentado', async () => {
    const r = await expandirIncludes('// {{INCLUDE PARR_NO_EXISTE}} — retirado\n{{INCLUDE PARR_A}}', repo, { centinelas: false });
    expect(r.faltantes).toEqual([]);
    expect(r.usados).toEqual(['PARR_A']);
    expect(r.texto).toBe('// {{INCLUDE PARR_NO_EXISTE}} — retirado\ntexto A');
  });
  it('tampoco expande uno que sí existe, aunque la línea esté sangrada', async () => {
    const r = await expandirIncludes('x\n   // {{INCLUDE PARR_A}}', repo, { centinelas: false });
    expect(r.usados).toEqual([]);
    expect(r.texto).toBe('x\n   // {{INCLUDE PARR_A}}');
  });
  it('un // en mitad de la línea no comenta el INCLUDE (stripDirectives ancla al principio)', async () => {
    const r = await expandirIncludes('ver https://x.es {{INCLUDE PARR_B}}', repo, { centinelas: false });
    expect(r.faltantes).toEqual(['PARR_B']);
  });
});
