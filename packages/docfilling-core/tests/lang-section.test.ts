import { describe, expect, it } from 'vitest';
import { LENGUA_APROBADA_FIN, LENGUA_APROBADA_INICIO, auditarSeccionesDeLengua, composeWithDiagnostics, expandirIncludes, parseFields, repositorioDeMapa, resolverSeccionesDeLengua } from '../index';

const PARR = `Antes.
{{LANG-SECTION es}}
**Revocación.-** {{IF PACTO}}Respeta el pacto de {{DATOS}}.{{ENDIF}} {{AUTO(NOMBRE):El testador|La testadora}}.
{{LANG-SECTION ca}}
**Revocació.-** {{IF PACTO}}Respecta el pacte de {{DATOS}}.{{ENDIF}} {{AUTO(NOMBRE):El testador|La testadora}}.
{{LANG-END}}
Después.`;

describe('{{LANG-SECTION}}', () => {
  it('toma la sección de la lengua; lo de fuera vale para todas', () => {
    const ca = resolverSeccionesDeLengua(PARR, 'ca');
    expect(ca.sinSeccion).toBe(0);
    expect(ca.texto).toContain('**Revocació.-**');
    expect(ca.texto).not.toContain('Revocación');
    expect(ca.texto).not.toContain('LANG-');
    expect(ca.texto.startsWith('Antes.\n')).toBe(true);
    expect(ca.texto.endsWith('Después.')).toBe(true);
    expect(resolverSeccionesDeLengua(PARR).texto).toContain('**Revocación.-**');
  });

  it('sin sección en esa lengua sale el castellano, y se cuenta', () => {
    const gl = resolverSeccionesDeLengua(PARR, 'gl');
    expect(gl.sinSeccion).toBe(1);
    expect(gl.texto).toContain('**Revocación.-**');
  });

  it('un fichero sin secciones no cambia, ni {{SCHEMA:LANG=es}} se confunde', () => {
    const t = '{{SCHEMA:LANG=es}}\nTexto {{CAMPO}}.';
    expect(resolverSeccionesDeLengua(t, 'ca')).toEqual({ texto: t, sinSeccion: 0 });
  });

  it('al expandir se resuelve fichero a fichero: un INCLUDE dentro de una sección no queda anidado', async () => {
    const repo = repositorioDeMapa({
      PARR_A: '{{LANG-SECTION es}}Hola.{{LANG-SECTION ca}}Hola, cat.{{LANG-END}}',
      PARR_SOLO_ES: 'Sólo castellano.',
    });
    const raiz = '{{LANG-SECTION es}}{{INCLUDE PARR_A}}{{LANG-SECTION ca}}{{INCLUDE PARR_A}} {{INCLUDE PARR_SOLO_ES}}{{LANG-END}}';
    const ca = await expandirIncludes(raiz, repo, { idioma: 'ca', centinelas: false });
    expect(ca.texto).toBe('Hola, cat. Sólo castellano.');
    expect(ca.sinSeccion).toBe(0);
    const es = await expandirIncludes(raiz, repo, { centinelas: false });
    expect(es.texto).toBe('Hola.');
    expect(es.usados).toEqual(['PARR_A']);
  });
});

describe('marcar lo que ya está en la lengua', () => {
  const repo = repositorioDeMapa({ PARR_A: '{{LANG-SECTION es}}Hola.{{LANG-SECTION ca}}Hola, cat.{{LANG-END}}', PARR_B: 'Sólo castellano.' });
  it('sólo lo que sale de una sección de esa lengua', async () => {
    const r = await expandirIncludes('{{INCLUDE PARR_A}}\n\n{{INCLUDE PARR_B}}', repo, { idioma: 'ca', centinelas: false, marcarLengua: true });
    const dentro = r.texto.slice(r.texto.indexOf(LENGUA_APROBADA_INICIO), r.texto.indexOf(LENGUA_APROBADA_FIN));
    expect(dentro).toContain('Hola, cat.');
    expect(dentro).not.toContain('Sólo castellano.');
    expect(r.texto).toContain('Sólo castellano.');
  });
  it('sin sección en esa lengua, no marca', async () => {
    const r = await expandirIncludes('{{INCLUDE PARR_A}}', repo, { idioma: 'gl', centinelas: false, marcarLengua: true });
    expect(r.texto).toBe('Hola.');
    expect(r.sinSeccion).toBe(1);
  });
});

describe('un texto con secciones que llega sin expandir', () => {
  const t = '{{LANG-SECTION es}}\nHola {{NOMBRE}}.\n{{LANG-SECTION ca}}\nHola, {{NOMBRE}}.\n{{LANG-END}}\nFin.';
  it('las marcas no son campos', () => {
    expect(parseFields(t).filter((f) => f.fieldType === 'extracted').map((f) => f.name)).toEqual(['NOMBRE', 'NOMBRE']);
  });
  it('componer da una sola lengua, sin [NO DISPONIBLE]', () => {
    expect(composeWithDiagnostics(t, { NOMBRE: 'Ana' }).text).toBe('Hola Ana.\nFin.');
    expect(composeWithDiagnostics(`{{SCHEMA:LANG=ca}}\n${t}`, { NOMBRE: 'Ana' }).text).toContain('Hola, Ana.');
  });
});

describe('la comprobación de las secciones', () => {
  it('bien: misma estructura aunque cambien el texto y las formas de AUTO', () => {
    expect(auditarSeccionesDeLengua(PARR)).toEqual([]);
    expect(auditarSeccionesDeLengua('{{LANG-SECTION es}}{{AUTO(X):el|la}}{{LANG-SECTION ca}}{{AUTO(X):el|la dona}}{{LANG-END}}')).toEqual([]);
  });

  it('avisa si una sección tiene otro IF, otro campo o le falta algo', () => {
    const otro = PARR.replace('**Revocació.-** {{IF PACTO}}', '**Revocació.-** {{IF OTRO}}');
    expect(auditarSeccionesDeLengua(otro)[0]).toContain('{{IF OTRO}}');
    const falta = PARR.replace('Respecta el pacte de {{DATOS}}.', 'Respecta el pacte.');
    expect(auditarSeccionesDeLengua(falta)[0]).toContain('no tiene la misma estructura');
  });

  it('avisa de lo mal formado: sin cerrar, cierre suelto, sección repetida o sin castellano', () => {
    expect(auditarSeccionesDeLengua('{{LANG-SECTION es}}Hola.')[0]).toContain('sin {{LANG-END}}');
    expect(auditarSeccionesDeLengua('Hola.{{LANG-END}}')[0]).toContain('sin {{LANG-SECTION}}');
    expect(auditarSeccionesDeLengua('{{LANG-SECTION es}}a{{LANG-SECTION es}}b{{LANG-END}}')[0]).toContain('dos veces');
    expect(auditarSeccionesDeLengua('{{LANG-SECTION ca}}a{{LANG-END}}')[0]).toContain('falta la sección «es»');
  });
});
