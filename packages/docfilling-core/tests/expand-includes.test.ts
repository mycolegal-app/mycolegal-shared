// F1.4 — expansión de INCLUDE sobre el puerto de párrafos.
import { describe, it, expect } from 'vitest';
import { expandirIncludes, repositorioDeMapa } from '../src/compose/expand-includes';
import { compose, INC_BEGIN_MARK, INC_END_MARK } from '../index';

describe('expandirIncludes', () => {
  it('sustituye un INCLUDE simple', async () => {
    const r = await expandirIncludes('Antes {{INCLUDE SALUDO}} después.',
      repositorioDeMapa({ SALUDO: 'Hola.' }), { centinelas: false });
    expect(r.texto).toBe('Antes Hola. después.');
    expect(r.usados).toEqual(['SALUDO']);
    expect(r.faltantes).toEqual([]);
  });

  it('expande INCLUDE anidados', async () => {
    const r = await expandirIncludes('{{INCLUDE A}}', repositorioDeMapa({
      A: 'a1 {{INCLUDE B}} a2',
      B: 'b1 {{INCLUDE C}} b2',
      C: 'hoja',
    }), { centinelas: false });
    expect(r.texto).toBe('a1 b1 hoja b2 a2');
    expect(r.usados).toEqual(['A', 'B', 'C']);
  });

  it('mantiene los offsets con varios INCLUDE en el mismo texto', async () => {
    const r = await expandirIncludes('{{INCLUDE UNO}}|{{INCLUDE DOS}}|{{INCLUDE TRES}}',
      repositorioDeMapa({ UNO: '1', DOS: '22', TRES: '333' }), { centinelas: false });
    expect(r.texto).toBe('1|22|333');
  });

  it('propaga el sufijo FIELDS:_sfx a los campos del párrafo y a los anidados', async () => {
    const r = await expandirIncludes('{{INCLUDE PERSONA FIELDS:_COMP}}',
      repositorioDeMapa({ PERSONA: '{{NOMBRE}} vive en {{INCLUDE DIRECCION}}', DIRECCION: '{{CALLE}}' }),
      { centinelas: false });
    expect(r.texto).toBe('{{NOMBRE_COMP}} vive en {{CALLE_COMP}}');
  });

  it('un párrafo que no existe se reporta y deja el marcador', async () => {
    const r = await expandirIncludes('X {{INCLUDE AUSENTE}} Y', repositorioDeMapa({}), { centinelas: false });
    expect(r.faltantes).toEqual(['AUSENTE']);
    expect(r.texto).toBe("X [Párrafo 'AUSENTE' no encontrado] Y");
  });

  it('detecta un ciclo y no se cuelga', async () => {
    const r = await expandirIncludes('{{INCLUDE A}}', repositorioDeMapa({
      A: 'a {{INCLUDE B}}',
      B: 'b {{INCLUDE A}}',
    }), { centinelas: false });
    expect(r.ciclos).toEqual(['A → B → A']);
    expect(r.texto).toContain('[Ciclo de INCLUDE: A → B → A]');
  });

  it('un párrafo que se incluye a sí mismo se corta en la primera vuelta', async () => {
    const r = await expandirIncludes('{{INCLUDE SOLO}}',
      repositorioDeMapa({ SOLO: 'x {{INCLUDE SOLO}}' }), { centinelas: false });
    expect(r.ciclos).toEqual(['SOLO → SOLO']);
    expect(r.texto).toBe('x [Ciclo de INCLUDE: SOLO → SOLO]');
  });

  it('respeta el tope de profundidad', async () => {
    const mapa: Record<string, string> = {};
    for (let i = 0; i < 20; i++) mapa[`N${i}`] = `${i} {{INCLUDE N${i + 1}}}`;
    mapa.N20 = 'fin';
    const r = await expandirIncludes('{{INCLUDE N0}}', repositorioDeMapa(mapa),
      { profundidadMaxima: 3, centinelas: false });
    // Para en la profundidad 3: la directiva más honda se queda sin expandir.
    expect(r.texto).toContain('{{INCLUDE N');
    expect(r.usados.length).toBeLessThanOrEqual(4);
  });

  it('envuelve con centinelas, y así EXIT_INCLUDE funciona AL GENERAR', async () => {
    // Es la diferencia deliberada con el Python: allí sólo el editor los pone,
    // así que EXIT_INCLUDE se veía en la previsualización y no en el documento.
    const r = await expandirIncludes('{{INCLUDE P}}\nCOLA', repositorioDeMapa({
      P: 'visible\n{{EXIT_INCLUDE}}\nnunca',
    }));
    expect(r.texto).toContain(INC_BEGIN_MARK);
    expect(r.texto).toContain(INC_END_MARK);
    const final = compose(r.texto, {});
    expect(final).toContain('visible');
    expect(final).not.toContain('nunca');
    expect(final).toContain('COLA');
    expect(final).not.toContain(INC_BEGIN_MARK);
  });

  it('sin INCLUDE, devuelve el texto tal cual', async () => {
    const r = await expandirIncludes('nada que expandir', repositorioDeMapa({}));
    expect(r.texto).toBe('nada que expandir');
    expect(r.usados).toEqual([]);
  });
});

describe('normalización de nombres (NFC vs NFD)', () => {
  it('encuentra el párrafo aunque la clave venga en NFD y la directiva en NFC', async () => {
    // Lo que pasa de verdad: el fichero del Drive llega en NFD (macOS) y la
    // plantilla escribe el nombre en NFC.
    const claveNFD = 'PARR_LEY_CATALUÑA'.normalize('NFD');
    const r = await expandirIncludes('{{INCLUDE PARR_LEY_CATALUÑA}}',
      repositorioDeMapa(new Map([[claveNFD, 'Ley catalana.']])), { centinelas: false });
    expect(r.texto).toBe('Ley catalana.');
    expect(r.faltantes).toEqual([]);
  });

  it('y al revés: clave en NFC y la PLANTILLA en NFD, que es el caso del Drive', async () => {
    // Sin normalizar la entrada, la tilde combinante corta el nombre y se
    // captura `PARR_LEY_ARAGO` — en el Python exactamente igual. Se arregla
    // normalizando el texto en la frontera, no tocando la regex.
    const r = await expandirIncludes(`{{INCLUDE ${'PARR_LEY_ARAGÓN'.normalize('NFD')}}}`,
      repositorioDeMapa({ 'PARR_LEY_ARAGÓN': 'Ley aragonesa.' }), { centinelas: false });
    expect(r.texto).toBe('Ley aragonesa.');
    expect(r.faltantes).toEqual([]);
  });

  it('un nombre mal escrito NO se arregla por normalizar (es contenido, no bytes)', async () => {
    // `CATALUNA` sin ñ existe en la biblioteca real: eso es un error de contenido y
    // tiene que seguir saliendo como faltante para que alguien lo cure.
    const r = await expandirIncludes('{{INCLUDE PARR_LEY_CATALUNA}}',
      repositorioDeMapa({ 'PARR_LEY_CATALUÑA': 'Ley catalana.' }), { centinelas: false });
    expect(r.faltantes).toEqual(['PARR_LEY_CATALUNA']);
  });
});
