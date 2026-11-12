// Los ejemplos del MANUAL, contra el motor.
//
// POR QUÉ ESTE TEST EXISTE
//
// Los manuales de sintaxis del Drive —`DOCFILLING_SYNTAX.md`, `CONDICIONALES.md`,
// `PARRAFOS.md`— se comparten con Doku y los usan agentes para generar plantillas.
// Una documentación que miente es peor que ninguna: quien la lea escribirá
// plantillas que no hacen lo que el manual promete.
//
// Aquí están los ejemplos que el manual afirma, verbatim. Si el motor cambia y
// el manual se queda viejo, esto falla y dice cuál.
import { describe, it, expect } from 'vitest';
import { auditarSeccionesDeLengua, compose, composeWithDiagnostics, resolverSeccionesDeLengua, validateText, parseNumero } from '../index';

describe('manual · la tabla de interpretación de números (§5)', () => {
  it.each([
    ['500000', 500000],
    ['500.000', 500000],
    ['500.000,00', 500000],
    ['500,000.00', 500000],
    ['500,50', 500.5],
    ['500.5', 500.5],
    ['500.000,00 €', 500000],
    ['-1.500,25', -1500.25],
  ])('%s se lee como %s', (escrito, esperado) => {
    expect(parseNumero(escrito)).toBeCloseTo(esperado, 9);
  });

  it.each(['1.2345,00', '12.34.567', '1,2,3.4.5'])('%s se rechaza, no se aproxima', (mal) => {
    expect(parseNumero(mal)).toBeNull();
  });
});

describe('manual · el umbral de apoderados (§5 y el registro de cambios)', () => {
  const T = '{{IF TOTAL_RESP_CANCELADA <= 500000}}un solo apoderado{{ELSE}}dos apoderados{{ENDIF}}';

  it('por debajo del límite firma uno', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '250000' })).toContain('un solo apoderado');
  });

  it('por encima firman dos, también con el importe en formato español', () => {
    expect(compose(T, { TOTAL_RESP_CANCELADA: '750.000,00' })).toContain('dos apoderados');
  });

  it('un valor no numérico avisa con W904', () => {
    const { warnings } = composeWithDiagnostics(T, { TOTAL_RESP_CANCELADA: 'pendiente' });
    expect(warnings.some((w) => w.code === 'W904')).toBe(true);
  });

  it('un campo vacío NO avisa: falta el dato, no es un error', () => {
    const { warnings } = composeWithDiagnostics(T, { TOTAL_RESP_CANCELADA: '' });
    expect(warnings.some((w) => w.code === 'W904')).toBe(false);
  });
});

describe('manual · cierres, directivas que sobreviven y diagnósticos', () => {
  it('{{END IF}} cierra el bloque (§5)', () => {
    expect(compose('{{IF X}}protegido{{END IF}}', { X: '' })).not.toContain('protegido');
  });

  it('…y avisa W903', () => {
    expect(validateText('{{IF X}}a{{END IF}}').diagnostics.some((d) => d.code === 'W903')).toBe(true);
  });

  it('{{PAGEBREAK}} sobrevive a la composición (§21.6)', () => {
    expect(compose('a\n{{PAGEBREAK}}\nb', {})).toContain('{{PAGEBREAK}}');
    // Y el manual promete que la grafía vieja sigue valiendo (D38).
    expect(compose('a\n{{SALTO_PAGINA}}\nb', {})).toContain('{{SALTO_PAGINA}}');
  });

  it('{{WORD_STYLE:...}} también (§21.6)', () => {
    expect(compose('{{WORD_STYLE:Fórmula notarial}}x', {}))
      .toContain('{{WORD_STYLE:Fórmula notarial}}');
  });

  it('un INCLUDE con ruta da E901 (§9)', () => {
    expect(validateText('{{INCLUDE FISCALIDAD_CCAA/09_CATALUNA/PARR_X}}').diagnostics
      .some((d) => d.code === 'E901')).toBe(true);
  });

  it('una palabra clave con dos puntos da E902 (§17)', () => {
    expect(validateText('{{IF: CAMPO}}').diagnostics.some((d) => d.code === 'E902')).toBe(true);
  });

  it.each([
    '{{COMMENT: nota}}', '{{DEPENDENCY: ley}}', '{{SYSTEM: FECHA}}',
    '{{AUTO:uno|dos}}', '{{HUMAN_ACTION: tarea}}', '{{TAGS: a,b}}', '{{SUMMARY: x}}',
  ])('…y las que SÍ llevan dos puntos no se quejan: %s', (t) => {
    expect(validateText(t).diagnostics.some((d) => d.code === 'E902')).toBe(false);
  });
});

describe('manual · formatos de salida (§1, 14-oct-2026)', () => {
  it.each([
    ['{{X#thousands}}', '3210', '3.210'],
    ['{{X#amount}}', '180000', '180.000,00'],
    ['{{X#amount_words}}', '180000,50', 'ciento ochenta mil euros con cincuenta céntimos'],
    ['{{X#words}}', '3', 'tres'],
    ['{{X#words_m}}', '21', 'veintiún'],
    ['{{X#words_f}}', '21', 'veintiuna'],
    ['{{X#percent}}', '50', '50 %'],
    ['{{X#percent_words}}', '50', 'cincuenta por ciento'],
    ['{{X#date}}', '2026-10-14', '14/10/2026'],
    ['{{X#date_long}}', '2026-10-14', '14 de octubre de 2026'],
    ['{{X#date_words}}', '2026-10-14', 'catorce de octubre de dos mil veintiséis'],
    ['{{X#upper}}', 'Ana Pérez', 'ANA PÉREZ'],
    ['{{X#lower}}', 'Separación de Bienes', 'separación de bienes'],
    ['{{X#capitalize}}', 'gananciales', 'Gananciales'],
    ['{{X#amount_words#upper}}', '180000', 'CIENTO OCHENTA MIL EUROS'],
    ['{{X:[el precio de la compraventa]#amount}}', '180000', '180.000,00'],
  ])('%s con %s → %s', (plantilla, valor, esperado) => {
    expect(compose(plantilla, { X: valor })).toBe(esperado);
  });

  it('E907 para un formato que no existe', () => {
    expect(validateText('{{PRECIO#amont}}').diagnostics.some((d) => d.code === 'E907')).toBe(true);
  });
});

describe('manual · secciones por lengua', () => {
  const PARRAFO = `{{LANG-SECTION es}}
**Revocación.-** Revoca cualquier disposición anterior. {{IF EXISTE_PACTO}}Respeta el pacto de {{DATOS_PACTO}}.{{ENDIF}}
{{LANG-SECTION ca}}
**Revocació.-** Revoca qualsevol disposició anterior. {{IF EXISTE_PACTO}}Respecta el pacte de {{DATOS_PACTO}}.{{ENDIF}}
{{LANG-END}}`;

  it('sale la sección de la lengua, y sin ella el castellano', () => {
    expect(resolverSeccionesDeLengua(PARRAFO, 'ca').texto).toContain('Revocació');
    expect(resolverSeccionesDeLengua(PARRAFO, 'ca').texto).not.toContain('Revocación');
    expect(resolverSeccionesDeLengua(PARRAFO, 'gl')).toMatchObject({ sinSeccion: 1 });
  });
  it('la carga comprueba que tengan la misma estructura', () => {
    expect(auditarSeccionesDeLengua(PARRAFO)).toEqual([]);
    expect(auditarSeccionesDeLengua(PARRAFO.replace('Respecta el pacte de {{DATOS_PACTO}}.', 'Respecta el pacte.'))).not.toEqual([]);
  });
});

describe('manual · DECLARE_UNDEF, valor de respaldo (§3.1)', () => {
  const cabecera = '{{DECLARE ES_ACTO_SIN_TRANSMISION AS BOOL=TRUE}}';
  const parrafo = '{{DECLARE_UNDEF ES_ACTO_SIN_TRANSMISION AS BOOL=FALSE}}{{IF ES_ACTO_SIN_TRANSMISION}}TRUE{{ELSE}}FALSE{{ENDIF}}';

  it('con la cabecera vale TRUE; en un esquema que no lo fija, FALSE', () => {
    expect(compose(cabecera + parrafo, {})).toBe('TRUE');
    expect(compose(parrafo, {})).toBe('FALSE');
  });
  it('regla 2: una declaración en una rama que no se toma no cuenta', () => {
    expect(compose('{{IF A}}' + cabecera + '{{ENDIF}}' + parrafo, { A: 'FALSE' })).toBe('FALSE');
  });
  it('regla 3: lo contestado no se pisa; regla 4: un DECLARE posterior sí', () => {
    expect(compose(parrafo, { ES_ACTO_SIN_TRANSMISION: 'TRUE' })).toBe('TRUE');
    expect(compose('{{DECLARE_UNDEF X="a"}}{{DECLARE X="b"}}{{X}}', {})).toBe('b');
  });
  it('E908 y W914', () => {
    const codigos = (t: string) => validateText(t).diagnostics.map((d) => d.code);
    expect(codigos('{{DECLARE_UNDEF ARRAY L:[A,B]}}')).toContain('E908');
    expect(codigos('{{DECLARE_UNDEF X}}{{X}}')).toContain('W914');
  });
});

describe('manual · SET y DECLARE en orden de documento (§3 y §3.bis, 10-nov-2026)', () => {
  it('§3: un DECLARE fijo dentro de un IF sólo vale si se toma la rama', () => {
    const T = '{{IF A}}{{DECLARE B=TRUE}}{{ENDIF}}B={{IF B}}sí{{ELSE}}no{{ENDIF}}';
    expect(compose(T, { A: 'TRUE' })).toBe('B=sí');
    expect(compose(T, { A: 'FALSE' })).toBe('B=no');
  });

  it('§3: sin valor no es lo mismo que FALSE en una comparación', () => {
    const T = '{{IF A}}{{DECLARE B=FALSE}}{{ENDIF}}{{IF B != "FALSE"}}distinto{{ELSE}}igual{{ENDIF}}';
    expect(compose(T, { A: 'TRUE' })).toBe('igual');
    expect(compose(T, { A: 'FALSE' })).toBe('distinto');
  });

  it('§3.bis: el uso típico, con el IF de después', () => {
    const T = '{{IF EXISTEN_CARGAS OR EXISTEN_AFECCIONES}}{{SET EXISTEN_CARGAS_O_AFECCIONES=TRUE}}{{ELSE}}{{SET EXISTEN_CARGAS_O_AFECCIONES=FALSE}}{{ENDIF}}{{IF EXISTEN_CARGAS_O_AFECCIONES}}cargas{{ENDIF}}';
    expect(compose(T, { EXISTEN_CARGAS: 'TRUE' })).toBe('cargas');
    expect(compose(T, { EXISTEN_CARGAS: 'FALSE', EXISTEN_AFECCIONES: 'FALSE' })).toBe('');
  });

  it('§3.bis: anidados y última asignación', () => {
    const T = '{{IF CAMPO1}}{{SET CAMPO2=X}}{{ELSE}}{{SET CAMPO2=Y}}{{IF CAMPO3}}{{SET CAMPO2=Z}}{{ENDIF}}{{ENDIF}}{{IF CAMPO2=="Y"}}abre{{ENDIF}}';
    expect(compose(T, { CAMPO1: 'TRUE' })).toBe('');
    expect(compose(T, { CAMPO1: 'FALSE', CAMPO3: 'FALSE' })).toBe('abre');
    expect(compose(T, { CAMPO1: 'FALSE', CAMPO3: 'TRUE' })).toBe('');
  });

  it('§3.bis: un IF antes del SET no lo ve; lo impreso lleva el último valor', () => {
    expect(compose('[{{B}}]{{IF B=="v"}}antes{{ENDIF}}{{SET B=v}}{{IF B=="v"}}después{{ENDIF}}', {})).toBe('[v]después');
  });

  it('§3.bis: un SET dentro de un FOR EACH lo ven la iteración y lo que va después del bucle', () => {
    const T = '{{FOR EACH P IN PARTES}}{{IF P.ES_MENOR}}{{SET HAY_MENOR=TRUE}}{{ENDIF}}{{IF HAY_MENOR}}m{{ELSE}}-{{ENDIF}}{{ENDFOR}}|{{IF HAY_MENOR}}con menores{{ENDIF}}';
    expect(compose(T, { PARTES: [{ ES_MENOR: 'FALSE' }, { ES_MENOR: 'TRUE' }] as never })).toBe('-m|con menores');
  });
});

describe('manual · metadatos del esquema SCHEMA: (§7.bis)', () => {
  const ESQ = `{{SCHEMA:ACT=1103 ALIAS ADJUDICACION_HERENCIA}}
{{SCHEMA:FAMILY=F11 ALIAS HERENCIAS}}
{{SCHEMA:VARIANT=SOBREVIVENCIA}}
{{SCHEMA:GROUP=TRANSMISION_GRATUITA, MORTIS_CAUSA}}
{{SCHEMA:LANG=es}}
`;
  const si = (cabecera: string, cond: string, v: Record<string, string> = {}) =>
    compose(`${cabecera}{{IF ${cond}}}SI{{ELSE}}NO{{ENDIF}}`, v).trim();

  it('la cabecera del manual valida sin errores y sale 0 caracteres', () => {
    expect(validateText(ESQ, undefined, undefined, { tipo: 'esquema' }).diagnostics.filter((d) => d.code.startsWith('E'))).toEqual([]);
    expect(compose(ESQ + 'Texto.', {})).toBe('Texto.');
  });

  it('los ejemplos de lectura', () => {
    expect(si(ESQ, 'SCHEMA:GROUP == "TRANSMISION_GRATUITA"')).toBe('SI');
    expect(si(ESQ, 'SCHEMA:FAMILY != "HERENCIAS" OR VAR_HAY_INMUEBLES', { VAR_HAY_INMUEBLES: 'No' })).toBe('NO');
    const compraventa = '{{SCHEMA:ACT=0501 ALIAS COMPRAVENTA}}\n{{SCHEMA:FAMILY=F05 ALIAS COMPRAVENTAS}}\n';
    expect(si(compraventa, 'SCHEMA:FAMILY != "HERENCIAS" OR VAR_HAY_INMUEBLES', { VAR_HAY_INMUEBLES: 'No' })).toBe('SI');
    expect(si(compraventa, 'SCHEMA:ACT == "COMPRAVENTA" AND SCHEMA:VARIANT != "ARRAS"')).toBe('SI');
    expect(si(compraventa, 'SCHEMA:ACT IN ("0501", "0502")')).toBe('SI');
    expect(compose(ESQ + 'Acto {{SCHEMA:ACT}}.', {})).toBe('Acto 1103.');
  });

  it('la tabla de comparación', () => {
    expect(si(ESQ, 'SCHEMA:ACT == "ADJUDICACION_HERENCIA"')).toBe(si(ESQ, 'SCHEMA:ACT == "1103"'));
    expect(si('{{SCHEMA:ACT=0501}}\n', 'SCHEMA:VARIANT == "X"')).toBe('NO');
    expect(si('{{SCHEMA:ACT=0501}}\n', 'SCHEMA:VARIANT != "X"')).toBe('SI');
    expect(si(ESQ, 'SCHEMA:GROUP != "MORTIS_CAUSA"')).toBe('NO');
    expect(si(ESQ, 'SCHEMA:GROUP IN ("OTRO", "MORTIS_CAUSA")')).toBe('SI');
    expect(si(ESQ, 'SCHEMA:GROUP NOT IN ("OTRO", "MORTIS_CAUSA")')).toBe('NO');
    expect(si(ESQ, 'SCHEMA:LANG == "es"')).toBe('SI');
  });

  it('los diagnósticos de §7.bis', () => {
    const c = (t: string, tipo?: 'esquema' | 'parrafo') => validateText(t, undefined, undefined, { tipo }).diagnostics.map((d) => d.code);
    expect(c('{{IF SCHEMA:ACT == "Compraventa"}}x{{ENDIF}}')).toContain('E924');
    expect(c('{{SCHEMA:GROUP=X}}', 'parrafo')).toContain('E921');
    expect(c('{{SCHEMA_ACT:1104}}')).toContain('E926');
    // Un párrafo suelto que LEE SCHEMA: no da error.
    expect(c('{{IF SCHEMA:GROUP == "X"}}x{{ENDIF}}', 'parrafo').filter((x) => x.startsWith('E'))).toEqual([]);
  });

  it('la forma retirada no declara nada', () => {
    expect(si('{{SCHEMA_ACT:1104}}\n{{LANG=ca}}\n', 'SCHEMA:ACT == "1104" OR SCHEMA:LANG == "ca"')).toBe('NO');
  });
});
