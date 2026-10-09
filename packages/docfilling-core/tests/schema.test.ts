// F1.5 — esquema de campos: lo que alimenta `faltantes[]` y el formulario del
// oficial. Port de `field_schema._parse` del SaaS (tarea A3 de FASE 32).
import { describe, it, expect } from 'vitest';
import { esquemaDeCampos, etiquetaPorDefecto, QUIEN } from '../index';

const campo = (plantilla: string, nombre: string) =>
  esquemaDeCampos(plantilla).campos.find((c) => c.nombre === nombre);

describe('esquemaDeCampos', () => {
  it('un campo suelto lo extrae la IA', () => {
    const c = campo('El precio es {{PRECIO}}.', 'PRECIO');
    expect(c?.quien).toBe(QUIEN.IA);
    expect(c?.tipo).toBe('TEXT');
    expect(c?.soloCondicional).toBe(false);
  });

  it('un INPUT puro lo aporta una persona', () => {
    const c = campo('{{REGIMEN:INPUT(Régimen económico|GANANCIALES,SEPARACION)}}', 'REGIMEN');
    expect(c?.quien).toBe(QUIEN.PERSONA);
    expect(c?.opciones).toEqual(['GANANCIALES', 'SEPARACION']);
    expect(c?.instruccion).toBe('Régimen económico');
  });

  it('⚠️ un DECLARE con INPUT(...) sale como `ia`, no como `persona`', () => {
    // Comportamiento del motor de referencia, comprobado contra el parser del
    // Python. Es la forma que usa la biblioteca real —580 de 3.613 DECLARE— así que
    // 580 campos pensados como elección humana de una lista cerrada se le
    // preguntan a la IA, que recibe las opciones sólo como restricción.
    // Se replica por paridad; la discusión de producto está anotada en el plan.
    const c = campo('{{DECLARE REGIMEN:INPUT(Régimen económico|GANANCIALES,SEPARACION)}}', 'REGIMEN');
    expect(c?.quien).toBe(QUIEN.IA);
    expect(c?.categoria).toBe('declare');
    // Aunque el `quien` sea `ia`, la descripción y las opciones SÍ se conservan:
    // son las del desplegable y la restricción que recibe la IA.
    expect(c?.instruccion).toBe('Régimen económico');
    expect(c?.opciones).toEqual(['GANANCIALES', 'SEPARACION']);
  });

  it('los campos de sistema los resuelve el motor y no se piden', () => {
    const c = campo('Hoy es {{DIA}} de {{MES}}.', 'DIA');
    expect(c?.quien).toBe(QUIEN.MOTOR);
    // Al motor no se le pone etiqueta legible: el nombre ya es el nombre.
    expect(c?.etiqueta).toBe('DIA');
  });

  it('respeta el tipo declarado', () => {
    expect(campo('{{DECLARE IMPORTE AS NUM:[el importe]}}', 'IMPORTE')?.tipo).toBe('NUM');
    expect(campo('{{DECLARE FIRMA AS DATE:[la fecha]}}', 'FIRMA')?.tipo).toBe('DATE');
  });

  it('un DECLARE es auxiliar: soloCondicional, así que no deja la tarea incompleta', () => {
    const c = campo('{{DECLARE TIENE_HIPOTECA AS BOOL:[¿hay hipoteca?]}}{{IF TIENE_HIPOTECA}}sí{{ENDIF}}', 'TIENE_HIPOTECA');
    expect(c?.soloCondicional).toBe(true);
  });

  it('un campo que SÍ se pinta no es soloCondicional, aunque gobierne un IF', () => {
    const e = esquemaDeCampos('{{IF CIUDAD}}en {{CIUDAD}}{{ENDIF}}');
    expect(e.campos.find((c) => c.nombre === 'CIUDAD')?.soloCondicional).toBe(false);
  });

  it('toma la instrucción de un campo suelto con `:[…]`', () => {
    const c = campo('{{PRECIO:[El precio en euros, sin símbolo]}}', 'PRECIO');
    expect(c?.instruccion).toBe('El precio en euros, sin símbolo');
  });

  it('un DECLARE con OPTIONS deja la lista en `opciones`, no pegada a la instrucción', () => {
    // El motor de referencia prefiere `declare_instruction` sobre la cadena
    // compuesta de `extract_field_instructions`, así que la restricción viaja
    // como lista y no como prosa. Comprobado contra el parser del Python.
    const c = campo('{{DECLARE ESTADO AS TEXT:[el estado civil]:OPTIONS(SOLTERO, CASADO)}}', 'ESTADO');
    expect(c?.instruccion).toBe('el estado civil');
    expect(c?.opciones).toEqual(['SOLTERO', 'CASADO']);
  });

  it('un DECLARE ARRAY con subcampos los trae, con tipo e instrucción', () => {
    // La sintaxis de subcampos es con PARÉNTESIS. Con `:[...]` eso es la
    // instrucción del array, no una lista de subcampos (comprobado en el Python).
    const c = campo('{{DECLARE ARRAY SUJS(NOM:[nombre completo], DNI AS TEXT:[el DNI])}}', 'SUJS');
    expect(c?.esArray).toBe(true);
    expect(c?.subcampos).toEqual([
      { nombre: 'NOM', tipo: 'TEXT', instruccion: 'nombre completo', iuiPath: null, req: [], doc: [] },
      { nombre: 'DNI', tipo: 'TEXT', instruccion: 'el DNI', iuiPath: null, req: [], doc: [] },
    ]);
  });

  it('un DECLARE ARRAY con `:[…]` tiene instrucción, no subcampos', () => {
    const c = campo('{{DECLARE ARRAY COMPRADORES:[NOMBRE, DNI, DOMICILIO]}}', 'COMPRADORES');
    expect(c?.esArray).toBe(true);
    expect(c?.subcampos).toEqual([]);
    expect(c?.instruccion).toBe('NOMBRE, DNI, DOMICILIO');
  });

  it('recoge la ruta IUI declarada en el DECLARE', () => {
    const c = campo(
      '{{DECLARE PRECIO AS NUM:[el precio]:IUI(DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP)}}',
      'PRECIO',
    );
    expect(c?.iuiPath).toBe('DOCS_NOT/DOC_NOT/OPES/OPE[1]/IMP');
  });

  it('no repite un campo que aparece varias veces', () => {
    const e = esquemaDeCampos('{{NOMBRE}} y otra vez {{NOMBRE}} y {{NOMBRE}}');
    expect(e.campos.filter((c) => c.nombre === 'NOMBRE')).toHaveLength(1);
  });

  it('lista los INCLUDE ordenados y sin repetir', () => {
    const e = esquemaDeCampos('{{INCLUDE Z}}{{INCLUDE A}}{{INCLUDE Z}}');
    expect(e.includes).toEqual(['A', 'Z']);
  });

  it('las acciones humanas no son campos', () => {
    const e = esquemaDeCampos('{{HUMAN_ACTION_PRE: pedir la nota simple}}{{NOMBRE}}');
    expect(e.campos.map((c) => c.nombre)).toEqual(['NOMBRE']);
    expect(e.accionesHumanas.pre).toEqual(['pedir la nota simple']);
  });

  it('acepta campos predefinidos por la organización, que no se piden', () => {
    const e = esquemaDeCampos('{{NOTARIO_NOMBRE}} y {{PRECIO}}', {
      camposPredefinidos: new Set(['NOTARIO_NOMBRE']),
    });
    // Sigue apareciendo en el esquema, pero marcado como no pedible por el
    // criterio de conditional-only del procesado.
    expect(e.campos.map((c) => c.nombre)).toContain('PRECIO');
  });

  it('etiqueta legible: al oficial no se le enseña el nombre técnico', () => {
    expect(etiquetaPorDefecto('PRECIO_TOTAL_VIVIENDA_M2')).toBe('Precio total vivienda m2');
    expect(campo('{{PRECIO_TOTAL}}', 'PRECIO_TOTAL')?.etiqueta).toBe('Precio total');
  });

  it('acepta un etiquetador propio (el hueco de F1.7)', () => {
    const e = esquemaDeCampos('{{PRECIO}}', { etiquetar: (n) => `¿Cuál es el ${n.toLowerCase()}?` });
    expect(e.campos[0].etiqueta).toBe('¿Cuál es el precio?');
  });

  it('normaliza la entrada: una plantilla en NFD no pierde la Ñ', () => {
    const e = esquemaDeCampos('{{AÑOS}}'.normalize('NFD'));
    expect(e.campos.map((c) => c.nombre)).toEqual(['AÑOS']);
  });
});

// ⚠️ LA DIVERGENCIA DELIBERADA CON `filler.py` (5-oct-2026).
//
// El Python marcaba auxiliar TODO campo declarado, también los que el documento
// imprime. Medido en la biblioteca: 809 campos declarados **y** pintados, que
// salían en blanco porque la pantalla no los ofrecía — entre ellos los del
// antecedente de cesión del 0505, que figura «completo» y sale con la finca, el
// CRU y el catastro vacíos.
describe('DECLARE + pintado: se pregunta (divergencia con filler.py)', () => {
  const esq = (t: string) => esquemaDeCampos(t);
  const campoDe = (t: string, n: string) => esq(t).campos.find((c) => c.nombre === n);

  it('declarado Y pintado NO es auxiliar: el documento lo imprime, así que se pide', () => {
    const t = '{{DECLARE FECHA_OPCION AS DATE:[la fecha]}}el día {{FECHA_OPCION}} se pactó';
    expect(campoDe(t, 'FECHA_OPCION')?.soloCondicional).toBe(false);
    // Y conserva lo que el DECLARE aporta, que es la razón de arreglarlo aquí y
    // no desdeclarando los 809 a mano: el tipo sobrevive.
    expect(campoDe(t, 'FECHA_OPCION')?.tipo).toBe('DATE');
  });

  it('declarado y NO pintado sigue siendo auxiliar', () => {
    const t = '{{DECLARE TIENE_HIPOTECA AS BOOL:[¿hay?]}}{{IF TIENE_HIPOTECA}}sí{{ENDIF}}';
    expect(campoDe(t, 'TIENE_HIPOTECA')?.soloCondicional).toBe(true);
  });

  it('declarado, pintado Y gobernando un IF: se pide, porque se imprime', () => {
    const t = '{{DECLARE CIUDAD:[la ciudad]}}{{IF CIUDAD}}en {{CIUDAD}}{{ENDIF}}';
    expect(campoDe(t, 'CIUDAD')?.soloCondicional).toBe(false);
  });
});
