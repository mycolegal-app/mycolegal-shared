// `E901` — el `{{INCLUDE}}` con ruta, que el lenguaje no admite (§4.12).
//
// El caso que lo motiva: 219 directivas así en `_PROD`, todas colapsando al
// nombre `FISCALIDAD_CCAA` y borrando su cláusula sin dar error.
import { describe, it, expect } from 'vitest';
import { validateText, parseFields } from '../index';

describe('E901 · INCLUDE con ruta', () => {
  it('lo detecta, y dice qué nombre lee el motor en realidad', () => {
    const d = validateText('{{INCLUDE FISCALIDAD_CCAA/09_CATALUNA/PARR_EXENCIONES_CATALUNA_EMPRESA}}').diagnostics;
    const e = d.filter((x) => x.code === 'E901');
    expect(e).toHaveLength(1);
    expect(e[0].message).toContain("'FISCALIDAD_CCAA'");
    expect(e[0].message).toContain('PARR_EXENCIONES_CATALUNA_EMPRESA');
  });

  it('el fix es el nombre solo, listo para aplicar', () => {
    const e = validateText('{{INCLUDE A/B/PARR_X}}').diagnostics.find((x) => x.code === 'E901')!;
    expect(e.fix?.replacement).toBe('{{INCLUDE PARR_X}}');
  });

  it('quita la extensión .md del último segmento', () => {
    const e = validateText('{{INCLUDE A/B/PARR_X.md}}').diagnostics.find((x) => x.code === 'E901')!;
    expect(e.fix?.replacement).toBe('{{INCLUDE PARR_X}}');
  });

  it('también con la forma no canónica {{INCLUDE: ...}}', () => {
    const d = validateText('{{INCLUDE: A/B/PARR_X}}').diagnostics;
    expect(d.filter((x) => x.code === 'E901')).toHaveLength(1);
  });

  it('demuestra POR QUÉ es un error: el parser corta en la barra', () => {
    const f = parseFields('{{INCLUDE FISCALIDAD_CCAA/09_CATALUNA/PARR_X}}')[0];
    expect(f.includeTarget).toBe('FISCALIDAD_CCAA');
    expect(f.includeTarget).not.toContain('PARR_X');
  });

  it('un INCLUDE normal no se queja, ni con FIELDS', () => {
    for (const t of ['{{INCLUDE PARR_X}}', '{{INCLUDE PARR_X FIELDS:_A}}']) {
      expect(validateText(t).diagnostics.filter((x) => x.code === 'E901')).toHaveLength(0);
    }
  });
});
