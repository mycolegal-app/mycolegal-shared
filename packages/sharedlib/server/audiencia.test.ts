import { describe, it, expect } from 'vitest';
import {
  audienciaDe, exigirAudiencia, AudienciaNoAdmitidaError,
  SOLO_INTERNA, INTERNA_Y_EXTERNA,
} from './audiencia';

/**
 * Esta clasificación decide qué identidad puede presentarse en qué app, con un
 * `JWT_SECRET` que es el mismo en todo el ecosistema. Equivocarse hacia dentro
 * abre una app interna a un tercero; equivocarse hacia fuera deja tirada a gente
 * que trabaja aquí. Las dos direcciones están cubiertas a propósito.
 */

describe('audienciaDe', () => {
  it('el personal de una notaría es interno', () => {
    expect(audienciaDe({ orgType: 'NOTARIA' })).toBe('internal');
  });

  it('los COLABORADORES del proyecto son internos, no terceros', () => {
    // #597: es el hogar de los colaboradores (Tomás), administrado por el
    // superadmin. Su única app es Consultor; clasificarlos como externos los
    // dejaría fuera de lo único que usan.
    expect(audienciaDe({ orgType: 'COLABORADOR' })).toBe('internal');
  });

  it('gestorías, asesorías, bancos y particulares son externos', () => {
    for (const t of ['GESTORIA', 'ASESOR', 'BANCO', 'INTERESADO']) {
      expect(audienciaDe({ orgType: t }), t).toBe('external');
    }
  });

  it('un token sin orgType es interno: es el comportamiento previo', () => {
    // Los externos SIEMPRE traen `orgType`. Tratar la ausencia como externa
    // dejaría fuera a tokens internos legítimos durante el despliegue, sin
    // cerrar nada que estuviera abierto.
    expect(audienciaDe({})).toBe('internal');
  });

  it('un superadmin es interno mire la organización que mire', () => {
    // Sin esto, un superadmin que selecciona la org de una gestoría se quedaría
    // fuera de Admin — justo cuando más falta le hace entrar.
    expect(audienciaDe({ orgType: 'GESTORIA', role: 'superadmin' })).toBe('internal');
    expect(audienciaDe({ orgType: 'INTERESADO', role: 'superadmin' })).toBe('internal');
  });

  it('suplantar a un externo SÍ produce identidad externa', () => {
    // Al suplantar, el token lleva el rol del suplantado. Y debe ser así: el
    // sentido de suplantar es ver exactamente lo que ve esa persona.
    expect(audienciaDe({ orgType: 'GESTORIA', role: 'user', impersonatedBy: 'x' } as never))
      .toBe('external');
  });

  it('no se fía del claim `aud` cuando hay orgType', () => {
    // `aud` lo estampa auth derivándolo de `orgType`; si llegaran en desacuerdo,
    // manda el hecho (quién es) y no la etiqueta.
    expect(audienciaDe({ orgType: 'GESTORIA', aud: 'internal' })).toBe('external');
  });
});

describe('exigirAudiencia', () => {
  it('deja pasar al personal de la notaría en una app interna', () => {
    expect(() => exigirAudiencia({ orgType: 'NOTARIA' }, SOLO_INTERNA, 'notaria')).not.toThrow();
  });

  it('RECHAZA a una gestoría en una app interna', () => {
    expect(() => exigirAudiencia({ orgType: 'GESTORIA' }, SOLO_INTERNA, 'notaria'))
      .toThrow(AudienciaNoAdmitidaError);
  });

  it('RECHAZA a un particular en una app interna', () => {
    expect(() => exigirAudiencia({ orgType: 'INTERESADO' }, SOLO_INTERNA, 'web'))
      .toThrow(AudienciaNoAdmitidaError);
  });

  it('deja pasar a un externo en un portal', () => {
    for (const t of ['GESTORIA', 'BANCO', 'INTERESADO']) {
      expect(() => exigirAudiencia({ orgType: t }, INTERNA_Y_EXTERNA, 'peticiones'), t).not.toThrow();
    }
  });

  it('un portal sigue admitiendo a los internos', () => {
    // La notaría entra a su propio portal para ver lo que ven sus gestorías.
    expect(() => exigirAudiencia({ orgType: 'NOTARIA' }, INTERNA_Y_EXTERNA, 'peticiones')).not.toThrow();
  });

  it('el error dice qué app y qué audiencia, para que el 401 sea diagnosticable', () => {
    try {
      exigirAudiencia({ orgType: 'BANCO' }, SOLO_INTERNA, 'tramitacion');
      throw new Error('debería haber lanzado');
    } catch (err) {
      expect(err).toBeInstanceOf(AudienciaNoAdmitidaError);
      expect((err as AudienciaNoAdmitidaError).appSlug).toBe('tramitacion');
      expect((err as AudienciaNoAdmitidaError).audiencia).toBe('external');
    }
  });
});

describe('forma de los claims que devuelve jose', () => {
  it('acepta `aud` como lista, que es lo que permite el estándar', () => {
    // `jose` tipa `aud` como `string | string[]`. Si el helper no lo admitiera,
    // cada app tendría que castear en el punto donde se decide quién entra.
    expect(audienciaDe({ aud: ['external'] })).toBe('external');
    expect(audienciaDe({ aud: ['internal'] })).toBe('internal');
  });

  it('no se rompe con claims de tipo inesperado', () => {
    // El payload de un JWT es `unknown` en la práctica: un `orgType` numérico no
    // debe colar como interno por accidente de tipos, sino caer al camino de `aud`.
    expect(audienciaDe({ orgType: 42 as never })).toBe('internal');
    expect(audienciaDe({ orgType: 42 as never, aud: 'external' })).toBe('external');
  });
});
