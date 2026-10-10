// F5.1 (plan REQ_CATALOGO_IUI, 10-oct-2026): el XML del Índice Único desde un modelo, para
// cualquier acto, validado contra el XSD IU2007 del CTN con `xmllint` (si está instalado).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serializarIui, fechaIso, decimalXsd, type ModeloIui } from '../src/iui/modelo';

const XSD = resolve(__dirname, 'fixtures/iui-xsd/documentos_notariales.xsd');
const hayXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function valida(xml: string): string {
  const f = join(mkdtempSync(join(tmpdir(), 'iui-')), 'doc.xml');
  writeFileSync(f, xml);
  try { execFileSync('xmllint', ['--noout', '--schema', XSD, f], { stdio: 'pipe' }); return 'ok'; }
  catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); }
}

const compraventa: ModeloIui = {
  documento: [{ ruta: 'FEC_AUT', valor: '10/10/2026' }, { ruta: 'NUM_DOC', valor: '1234' }, { ruta: 'TIP_DOC', valor: '1' }],
  sujetos: [
    { id: 1, entradas: [{ ruta: 'TIP_COM', valor: '1' }, { ruta: 'TIP_PER', valor: '1' }, { ruta: 'PRE_REP', valor: '1' }, { ruta: 'PER/NOM', valor: 'Juan' }, { ruta: 'PER/ESTADO_CIVIL', valor: '2' }] },
    { id: 2, entradas: [{ ruta: 'TIP_PER', valor: '1' }, { ruta: 'TIP_COM', valor: '1' }, { ruta: 'PER/NOM', valor: 'Ana' }] },
  ],
  objetos: [{ id: 1, entradas: [{ ruta: 'TIP_OBJ', valor: '1' }] }],
  operaciones: [{
    acto: '0501', entradas: [{ ruta: 'CUAS_OPE/CUA_OPE', valor: '250.000,00' }],
    clases: [{ sujetos: [1] }, { sujetos: [2] }],
    objetos: [{ objeto: 1, entradas: [], clases: [[{ sujeto: 1, entradas: [{ ruta: 'DER/CLA_DER', valor: '1' }] }], [{ sujeto: 2, entradas: [] }]] }],
  }],
};

describe('el XML del IUI desde el modelo', () => {
  it('en el orden del XSD, con fechas e importes como los quiere', () => {
    const { xml, avisos } = serializarIui(compraventa);
    expect(xml).toContain('<FEC_AUT>2026-10-10</FEC_AUT>');
    expect(xml).toContain('<CUA_OPE>250000.00</CUA_OPE>');
    // El orden del XSD, no el de escritura: IDE_SUJ antes que TIP_COM y TIP_PER antes que PER.
    const suj = xml.slice(xml.indexOf('<SUJ>'), xml.indexOf('</SUJ>'));
    expect(suj.indexOf('<IDE_SUJ>')).toBeLessThan(suj.indexOf('<TIP_COM>'));
    expect(suj.indexOf('<PRE_REP>')).toBeLessThan(suj.indexOf('<PER>'));
    // La operación cita a los sujetos por su id, en su clase.
    expect(xml).toMatch(/<PRI_CLA_OTOS>\s*<PRI_CLA_OTO>\s*<ID_SUJ>1<\/ID_SUJ>/);
    expect(xml).toMatch(/<SEG_CLA_OTOS>\s*<SEG_CLA_OTO>\s*<ID_SUJ>2<\/ID_SUJ>/);
    expect(avisos.filter((a) => !a.startsWith('falta'))).toEqual([]);
  });

  it.skipIf(!hayXmllint)('valida contra el XSD IU2007 del CTN', () => {
    const { xml, avisos } = serializarIui(compraventa);
    expect(avisos.filter((a) => a.startsWith('falta'))).toEqual([]);
    expect(valida(xml)).toBe('ok');
  });

  it('lo que no vale se descarta y se avisa, y no rompe el XML', () => {
    const m: ModeloIui = { documento: [], sujetos: [{ id: 1, entradas: [
      { ruta: 'TIP_PER', valor: '7' },           // código que no existe
      { ruta: 'PER/NO_EXISTE', valor: 'x' },     // ruta que no existe
      { ruta: 'PER', valor: 'x' },               // no es hoja
    ] }], objetos: [], operaciones: [] };
    const { xml, avisos } = serializarIui(m);
    expect(avisos.some((a) => /«7» no vale para TIP_PER/.test(a))).toBe(true);
    expect(avisos.some((a) => /NO_EXISTE.*no existe/.test(a))).toBe(true);
    expect(avisos.some((a) => /«PER» no lleva valor/.test(a))).toBe(true);
    expect(xml).not.toContain('TIP_PER');
    if (hayXmllint) expect(valida(xml)).toBe('ok');
  });

  it('de una elección del XSD va una sola rama', () => {
    const m: ModeloIui = { documento: [], sujetos: [], objetos: [{ id: 1, entradas: [
      { ruta: 'FIN_URB/REF_CAT', valor: '0123456DF2902S0001AB' }, { ruta: 'FIN_RUS/REF_CAT', valor: 'X' },
    ] }], operaciones: [] };
    const { avisos } = serializarIui(m);
    expect(avisos.some((a) => /se excluyen/.test(a))).toBe(true);
  });

  it('fechas e importes', () => {
    expect([fechaIso('1/2/2026'), fechaIso('2026-02-01'), fechaIso('ayer')]).toEqual(['2026-02-01', '2026-02-01', null]);
    expect([decimalXsd('250.000,50'), decimalXsd('1200'), decimalXsd('12,5'), decimalXsd('mucho')]).toEqual(['250000.50', '1200', '12.5', null]);
  });
});
