// `{{BLOQUEO: texto}}` (12-nov-2026, Carles; dictamen P30): no se imprime y la composición devuelve los vivos.
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics, compose, validateText, esquemaDeCampos, bloqueosDeclarados } from '../index';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';

const HUELLA = '{{DECLARE HUELLA_DENTRO_SUELO_REAL:INPUT(¿La huella está dentro del suelo real?|Sí,No)}}\n'
  + 'Declaran la obra.\n'
  + '{{IF HUELLA_DENTRO_SUELO_REAL == "No"}}\n{{BLOQUEO: La huella se sale del suelo real: rectifique el certificado técnico o la geometría.}}\n{{ENDIF}}\n'
  + 'Fin.';

describe('BLOQUEO al componer', () => {
  it('con su rama viva sale en `bloqueos` y no se imprime, sin dejar línea en blanco', () => {
    const r = composeWithDiagnostics(HUELLA, { HUELLA_DENTRO_SUELO_REAL: 'No' });
    expect(r.bloqueos).toEqual(['La huella se sale del suelo real: rectifique el certificado técnico o la geometría.']);
    expect(r.text).not.toMatch(/BLOQUEO|huella se sale|\x00/);
    expect(r.text).toBe(compose(HUELLA, { HUELLA_DENTRO_SUELO_REAL: 'Sí' }));
  });

  it('con su rama muerta no hay bloqueo', () => {
    expect(composeWithDiagnostics(HUELLA, { HUELLA_DENTRO_SUELO_REAL: 'Sí' }).bloqueos).toEqual([]);
  });

  it('dentro de un FOR EACH sale una sola vez aunque lo abran varios elementos', () => {
    const t = '{{FOR EACH ITEM IN FINCAS}}{{IF ITEM.FUERA == "Sí"}}{{BLOQUEO: Una finca se sale.}}{{ENDIF}}{{ENDFOR}}';
    const r = composeWithDiagnostics(t, { FINCAS: [{ FUERA: 'Sí' }, { FUERA: 'Sí' }, { FUERA: 'No' }] } as never);
    expect(r.bloqueos).toEqual(['Una finca se sale.']);
  });

  it('no es un campo, ni lo renombra el sufijo de un INCLUDE', async () => {
    expect(esquemaDeCampos(HUELLA, {}).campos.map((c: { nombre: string }) => c.nombre)).not.toContain('BLOQUEO');
    const r = await expandirIncludes('{{INCLUDE P FIELDS:_A}}', repositorioDeMapa({ P: '{{IF X}}{{BLOQUEO: Texto.}}{{ENDIF}}' }), { centinelas: false });
    expect(r.texto).toBe('{{IF X_A}}{{BLOQUEO: Texto.}}{{ENDIF}}');
    expect(bloqueosDeclarados(r.texto)).toEqual(['Texto.']);
  });
});

describe('BLOQUEO en el validador', () => {
  const codigos = (t: string, tipo?: 'esquema' | 'parrafo') =>
    validateText(t, undefined, undefined, tipo ? { tipo } : {}).diagnostics.map((d) => d.code).filter((c) => /9(28|29)$/.test(c));

  it('dentro de un IF no avisa', () => expect(codigos(HUELLA.replace('{{BLOQUEO:', '{{ABORT:'))).toEqual([]));
  it('W928 fuera de todo IF en un esquema; en un párrafo no', () => {
    expect(codigos('{{ABORT: Siempre.}}\nTexto.')).toEqual(['W928']);
    expect(codigos('{{ABORT: Siempre.}}\nTexto.', 'parrafo')).toEqual([]);
  });
  it('E929 sin texto', () => expect(codigos('{{IF X}}{{ABORT: }}{{ENDIF}}')).toEqual(['E929']));
  it('no añade otros diagnósticos', () => {
    const otros = validateText(HUELLA.replace('{{BLOQUEO:', '{{ABORT:')).diagnostics.filter((d) => /BLOQUEO/i.test(d.message));
    expect(otros).toEqual([]);
  });
});

describe('ABORT, el nombre nuevo de BLOQUEO (25-nov-2026)', () => {
  const ABORT = HUELLA.replace('{{BLOQUEO:', '{{ABORT:');
  it('se compone igual: vivo en `bloqueos`, nunca impreso', () => {
    const r = composeWithDiagnostics(ABORT, { HUELLA_DENTRO_SUELO_REAL: 'No' });
    expect(r.bloqueos).toEqual(composeWithDiagnostics(HUELLA, { HUELLA_DENTRO_SUELO_REAL: 'No' }).bloqueos);
    expect(r.text).not.toMatch(/ABORT|huella se sale|\x00/);
    expect(composeWithDiagnostics(ABORT, { HUELLA_DENTRO_SUELO_REAL: 'Sí' }).bloqueos).toEqual([]);
    expect(bloqueosDeclarados(ABORT)).toEqual(bloqueosDeclarados(HUELLA));
  });
  it('no es un campo y no avisa; BLOQUEO sí avisa W929 (obsoleto) pero sigue valiendo', () => {
    expect(esquemaDeCampos(ABORT).campos.map((c) => c.nombre)).not.toContain('ABORT');
    const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);
    expect(codigos(ABORT)).not.toContain('W929');
    expect(codigos(HUELLA)).toContain('W929');
    expect(codigos('{{IF X}}{{ABORT: }}{{ENDIF}}')).toContain('E929');
  });
});
