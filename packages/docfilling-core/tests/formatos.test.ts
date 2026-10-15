// Formatos de salida `{{CAMPO#formato}}` (14-oct-2026): el motor escribe el dato como lo pide la
// plantilla, sin depender de que la IA lo devuelva con el formato de la instrucción.
import { describe, it, expect } from 'vitest';
import {
  compose, composeWithDiagnostics, composeForPreview, parseFields, validateText, applyFieldSuffix,
  esquemaDeCampos, aplicarFormato, aplicarFormatos, enLetras,
} from '../index';

describe('aplicarFormato', () => {
  it('cifras', () => {
    expect(aplicarFormato('3210', 'thousands').texto).toBe('3.210');
    expect(aplicarFormato('3.210', 'thousands').texto).toBe('3.210');
    expect(aplicarFormato('1234567,5', 'thousands').texto).toBe('1.234.567,5');
    expect(aplicarFormato('180000', 'amount').texto).toBe('180.000,00');
    expect(aplicarFormato('180.000 €', 'amount').texto).toBe('180.000,00');
    expect(aplicarFormato('95000.5', 'amount').texto).toBe('95.000,50');
    expect(aplicarFormato('50', 'percent').texto).toBe('50 %');
    expect(aplicarFormato('33,33%', 'percent').texto).toBe('33,33 %');
  });

  it('letras en castellano', () => {
    expect(enLetras(0)).toBe('cero');
    expect(enLetras(21)).toBe('veintiuno');
    expect(enLetras(100)).toBe('cien');
    expect(enLetras(101)).toBe('ciento uno');
    expect(enLetras(21000)).toBe('veintiún mil');
    expect(enLetras(101000)).toBe('ciento un mil');
    expect(enLetras(1_000_000)).toBe('un millón');
    expect(enLetras(2_500_000)).toBe('dos millones quinientos mil');
    expect(enLetras(2026)).toBe('dos mil veintiséis');
    expect(aplicarFormato('3', 'words').texto).toBe('tres');
    expect(aplicarFormato('180000', 'amount_words').texto).toBe('ciento ochenta mil euros');
    expect(aplicarFormato('180000,50', 'amount_words').texto).toBe('ciento ochenta mil euros con cincuenta céntimos');
    expect(aplicarFormato('21', 'amount_words').texto).toBe('veintiún euros');
    expect(aplicarFormato('1', 'amount_words').texto).toBe('un euro');
    expect(aplicarFormato('2000000', 'amount_words').texto).toBe('dos millones de euros');
    expect(aplicarFormato('50', 'percent_words').texto).toBe('cincuenta por ciento');
    expect(aplicarFormato('33,5', 'percent_words').texto).toBe('treinta y tres coma cinco por ciento');
  });

  it('letras en catalán', () => {
    expect(enLetras(21, 'ca')).toBe('vint-i-u');
    expect(enLetras(2026, 'ca')).toBe('dos mil vint-i-sis');
    expect(aplicarFormato('180000,50', 'amount_words', 'ca').texto).toBe('cent vuitanta mil euros amb cinquanta cèntims');
    expect(aplicarFormato('21', 'amount_words', 'ca').texto).toBe('vint-i-un euros');
    expect(aplicarFormato('50', 'percent_words', 'ca').texto).toBe('cinquanta per cent');
  });

  it('fechas', () => {
    expect(aplicarFormato('2026-10-14', 'date').texto).toBe('14/10/2026');
    expect(aplicarFormato('14/10/2026', 'date_long').texto).toBe('14 de octubre de 2026');
    expect(aplicarFormato('14 de octubre de 2026', 'date_words').texto).toBe('catorce de octubre de dos mil veintiséis');
    expect(aplicarFormato('2026-10-14', 'date_long', 'ca').texto).toBe("14 d'octubre de 2026");
    expect(aplicarFormato('2026-03-01', 'date_words', 'ca').texto).toBe('u de març de dos mil vint-i-sis');
  });

  it('texto', () => {
    expect(aplicarFormato('Separación de Bienes', 'lower').texto).toBe('separación de bienes');
    expect(aplicarFormato('ana pérez', 'upper').texto).toBe('ANA PÉREZ');
    expect(aplicarFormato('gananciales', 'capitalize').texto).toBe('Gananciales');
    expect(aplicarFormatos('1000', ['amount_words', 'upper']).texto).toBe('MIL EUROS');
  });

  it('un valor que no se deja leer sale tal cual, con el problema', () => {
    const r = aplicarFormato('DATO DE PRUEBA', 'amount');
    expect(r.texto).toBe('DATO DE PRUEBA');
    expect(r.problema).toMatch(/no es un número/);
    expect(aplicarFormato('ayer', 'date_long').problema).toMatch(/no es una fecha/);
    expect(aplicarFormato('3', 'nada').problema).toMatch(/desconocido/);
  });
});

describe('en la composición', () => {
  it('campo suelto, con instrucción y encadenado', () => {
    const t = 'Finca {{FINCA#thousands}}, precio {{PRECIO:[el precio]#amount}} euros ({{PRECIO#amount_words#upper}}). Original {{PRECIO}}.';
    expect(compose(t, { FINCA: '3210', PRECIO: '180000' }))
      .toBe('Finca 3.210, precio 180.000,00 euros (CIENTO OCHENTA MIL EUROS). Original 180000.');
  });

  it('en el idioma de la plantilla', () => {
    expect(compose('{{LANG=ca}}{{F#date_long}}', { F: '2026-10-14' })).toContain("14 d'octubre de 2026");
  });

  it('subcampos de una lista', () => {
    const t = '{{FOR EACH C IN COMUNEROS}}{{C.NOMBRE#upper}}: {{C.CUOTA#percent}}; {{ENDFOR}}';
    const v = { COMUNEROS: [{ NOMBRE: 'Ana', CUOTA: '50' }, { NOMBRE: 'Luis', CUOTA: '50' }] } as never;
    expect(compose(t, v)).toBe('ANA: 50 %; LUIS: 50 %; ');
  });

  it('un valor sin formato posible sale tal cual y avisa W110', () => {
    const r = composeWithDiagnostics('{{PRECIO#amount}}', { PRECIO: 'DATO DE PRUEBA' });
    expect(r.text).toBe('DATO DE PRUEBA');
    expect(r.warnings.map((w) => w.code)).toContain('W110');
  });

  it('sin valor: [NO DISPONIBLE], como cualquier campo', () => {
    expect(compose('{{PRECIO#amount}}', {})).toBe('[NO DISPONIBLE]');
  });

  it('el campo decide igual en un IF: el formato es sólo de salida', () => {
    expect(compose('{{IF PRECIO > 100000}}caro{{ENDIF}} {{PRECIO#amount}}', { PRECIO: '180000' })).toBe('caro 180.000,00');
  });

  it('vista previa', () => {
    expect(composeForPreview('{{FINCA#thousands}} {{OTRO#amount}}', { FINCA: '3210' })).toBe('3.210 {{OTRO#amount}}');
  });

  it('el sufijo de INCLUDE renombra el campo y conserva el formato', () => {
    expect(applyFieldSuffix('{{PRECIO#amount}} {{PRECIO:[x]#amount}}', '_B')).toBe('{{PRECIO_B#amount}} {{PRECIO_B:[x]#amount}}');
  });
});

describe('en el análisis de la plantilla', () => {
  it('el parser separa nombre y formatos', () => {
    const [f] = parseFields('{{PRECIO:[el precio]#amount_words#upper}}');
    expect(f.name).toBe('PRECIO');
    expect(f.formatos).toEqual(['amount_words', 'upper']);
  });

  it('el esquema pide el campo, no «CAMPO#formato», y conserva la instrucción', () => {
    const e = esquemaDeCampos('{{FINCA:[número de finca]#thousands}} {{FOR EACH C IN LISTA}}{{C.CUOTA#percent}}{{ENDFOR}}');
    const nombres = e.campos.map((c) => c.nombre);
    expect(nombres).toContain('FINCA');
    expect(nombres.some((n) => n.includes('#'))).toBe(false);
    expect(nombres).not.toContain('PERCENT');
    expect(e.campos.find((c) => c.nombre === 'FINCA')?.instruccion).toBe('número de finca');
    const lista = e.campos.find((c) => c.nombre === 'LISTA');
    expect(lista?.subcampos.map((s) => s.nombre)).toEqual(['CUOTA']);
  });

  it('E907: formato que no existe', () => {
    const d = validateText('{{PRECIO#amont}}').diagnostics.filter((x) => x.code === 'E907');
    expect(d).toHaveLength(1);
    expect(d[0].message).toMatch(/amont/);
    expect(validateText('{{PRECIO#amount}}').diagnostics.filter((x) => x.code === 'E907')).toHaveLength(0);
  });

  it('el # de una URL de DEPENDENCY no es un formato', () => {
    const t = '{{DEPENDENCY:Ley:https://www.boe.es/x.php?id=1#a25}}';
    expect(validateText(t).diagnostics.filter((x) => x.code === 'E907')).toHaveLength(0);
  });
});
