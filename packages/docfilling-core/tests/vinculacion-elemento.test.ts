// Vinculación de un párrafo a un elemento de lista (5-oct-2026).
// `{{INCLUDE X(ITEM)}}` (intervención) y `{{INCLUDE X FIELDS:(ITEM)}}`
// (comparecencia de varias personas) querían decir «los campos de X son los
// del elemento de esta vuelta». Antes el argumento se descartaba en silencio y
// cada vuelta pintaba los mismos campos globales.
import { describe, it, expect } from 'vitest';
import { composeWithDiagnostics } from '../index';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';

const componer = async (t: string, parrafos: Record<string, string>, campos: Record<string, unknown>) => {
  const r = await expandirIncludes(t, repositorioDeMapa(parrafos));
  return (composeWithDiagnostics(r.texto, campos as never) as { text: string }).text;
};

const BLOQUE = 'Don {{NOMBRE}}, con DNI {{DNI}}{{IF CASADO}}, casado{{ENDIF}}, vecino de {{MUNICIPIO_NOTARIA}}.';
const LISTA = [{ NOMBRE: 'Ana', DNI: '1', CASADO: 'FALSE' }, { NOMBRE: 'Luis', DNI: '2', CASADO: 'TRUE' }];

describe('INCLUDE vinculado a ITEM', () => {
  it('forma X(ITEM): cada vuelta usa los campos de su elemento', async () => {
    const t = '{{FOR EACH ITEM IN LISTA_COMPARECIENTES}}{{INCLUDE PARR_BLOQUE(ITEM)}}\n{{ENDFOR}}';
    expect((await componer(t, { PARR_BLOQUE: BLOQUE }, { LISTA_COMPARECIENTES: LISTA, MUNICIPIO_NOTARIA: 'Sabadell' })).trim())
      .toBe('Don Ana, con DNI 1, vecino de Sabadell.\nDon Luis, con DNI 2, casado, vecino de Sabadell.');
  });

  it('forma FIELDS:(ITEM): igual', async () => {
    const t = '{{FOR EACH ITEM IN LISTA_VENDEDORES}}{{INCLUDE PARR_BLOQUE FIELDS:(ITEM)}}|{{ENDFOR}}';
    expect(await componer(t, { PARR_BLOQUE: BLOQUE }, { LISTA_VENDEDORES: LISTA, MUNICIPIO_NOTARIA: 'Sabadell' }))
      .toBe('Don Ana, con DNI 1, vecino de Sabadell.|Don Luis, con DNI 2, casado, vecino de Sabadell.|');
  });

  it('lo que el elemento no trae sigue siendo global', async () => {
    const t = '{{FOR EACH ITEM IN L}}{{INCLUDE PARR_BLOQUE(ITEM)}}{{ENDFOR}}';
    expect(await componer(t, { PARR_BLOQUE: BLOQUE }, { L: [{ NOMBRE: 'Ana' }], DNI: 'GLOBAL', MUNICIPIO_NOTARIA: 'Sabadell' }))
      .toBe('Don Ana, con DNI GLOBAL, vecino de Sabadell.');
  });

  it('fuera de un bucle, el párrafo se incluye como siempre', async () => {
    expect(await componer('{{INCLUDE PARR_BLOQUE(ITEM)}}', { PARR_BLOQUE: BLOQUE }, { NOMBRE: 'Eva', DNI: '9', MUNICIPIO_NOTARIA: 'Sabadell' }))
      .toBe('Don Eva, con DNI 9, vecino de Sabadell.');
  });

  it('el párrafo vinculado puede incluir otros: también se vinculan', async () => {
    const t = '{{FOR EACH ITEM IN L}}{{INCLUDE PADRE(ITEM)}};{{ENDFOR}}';
    expect(await componer(t, { PADRE: '[{{INCLUDE HIJO}}]', HIJO: '{{NOMBRE}}' }, { L: [{ NOMBRE: 'A' }, { NOMBRE: 'B' }] })).toBe('[A];[B];');
  });
});

describe('rutas de varios niveles', () => {
  it('ITEM.LINDEROS.FRENTE', async () => {
    const t = '{{FOR EACH ITEM IN ENTIDADES_PH}}{{ITEM.NUMERO_ENTIDAD}}: frente {{ITEM.LINDEROS.FRENTE}}, fondo {{ITEM.LINDEROS.FONDO}}{{IF ITEM.LINDEROS.DERECHA}}, derecha {{ITEM.LINDEROS.DERECHA}}{{ENDIF}}.{{ENDFOR}}';
    expect(await componer(t, {}, { ENTIDADES_PH: [{ NUMERO_ENTIDAD: '1', LINDEROS: { FRENTE: 'calle', FONDO: 'patio', DERECHA: 'local 2' } }] }))
      .toBe('1: frente calle, fondo patio, derecha local 2.');
  });
});
