import { describe, it, expect } from 'vitest';
import { exigirAppContratada, AppNoContratadaError } from './contratacion';
import { exigirAudiencia, SOLO_INTERNA } from './audiencia';

/**
 * Esta frontera decide si la organización del token tiene contratada la app,
 * con un `JWT_SECRET` que es el mismo en todo el ecosistema. Las dos
 * direcciones hacen daño y las dos están cubiertas: dejar pasar de más abre una
 * app no contratada a quien tenga sesión en otra (#898), y cerrar de más corta
 * el trabajo de una notaría entera.
 */

describe('exigirAppContratada', () => {
  it('deja pasar cuando la app está en el token', () => {
    expect(() => exigirAppContratada({ apps: ['notaria', 'archivo'] }, 'archivo')).not.toThrow();
  });

  it('rechaza cuando la app NO está: es el caso de la incidencia', () => {
    // Ana entraba en Notaría y cambiaba la dirección a la de Tramitación, que
    // su notaría no tenía contratada, y pasaba.
    expect(() => exigirAppContratada({ apps: ['notaria'] }, 'tramitacion')).toThrow(
      AppNoContratadaError,
    );
  });

  it('un token SIN el claim pasa, para que el despliegue no corte a nadie', () => {
    // Mientras conviven tokens viejos (hasta 17 min) y nuevos, la ausencia no
    // puede significar denegación: dejaría fuera a todo el mundo.
    expect(() => exigirAppContratada({}, 'tramitacion')).not.toThrow();
    expect(() => exigirAppContratada({ apps: undefined }, 'tramitacion')).not.toThrow();
  });

  it('una lista VACÍA sí deniega: es una respuesta, no una ausencia', () => {
    expect(() => exigirAppContratada({ apps: [] }, 'tramitacion')).toThrow(AppNoContratadaError);
  });

  it('el superadmin entra en cualquier app', () => {
    expect(() =>
      exigirAppContratada({ apps: ['consultor'], role: 'superadmin' }, 'notaria'),
    ).not.toThrow();
  });

  it('las consolas de plataforma están exentas: no se conceden como OrgApp', () => {
    // Si se les exigiera contratación, nadie entraría nunca — ninguna
    // organización tiene `config` ni `admin` como OrgApp por diseño.
    expect(() => exigirAppContratada({ apps: ['notaria'] }, 'config')).not.toThrow();
    expect(() => exigirAppContratada({ apps: ['notaria'] }, 'admin')).not.toThrow();
  });

  it('ignora entradas que no sean cadenas en vez de reventar', () => {
    expect(() =>
      exigirAppContratada({ apps: [null, 42, 'archivo'] as unknown[] }, 'archivo'),
    ).not.toThrow();
  });

  it('un claim que no es lista se trata como ausente', () => {
    expect(() => exigirAppContratada({ apps: 'notaria' }, 'tramitacion')).not.toThrow();
  });
});

describe('exigirAudiencia también aplica la contratación', () => {
  // Va colgada de ahí para que la frontera llegue a las catorce apps sin tocar
  // ninguna: todas llaman ya a `exigirAudiencia` con su propio slug.
  it('un interno de una notaría sin la app contratada no entra', () => {
    expect(() =>
      exigirAudiencia({ orgType: 'NOTARIA', apps: ['notaria'] }, SOLO_INTERNA, 'tramitacion'),
    ).toThrow(AppNoContratadaError);
  });

  it('con la app contratada, entra', () => {
    expect(() =>
      exigirAudiencia(
        { orgType: 'NOTARIA', apps: ['notaria', 'tramitacion'] },
        SOLO_INTERNA,
        'tramitacion',
      ),
    ).not.toThrow();
  });

  it('la audiencia se comprueba ANTES: a un externo se le dice eso, no lo otro', () => {
    // Si se invirtiera el orden, a una gestoría que llega a Notaría se le diría
    // «tu organización no tiene contratada esta app», que es cierto pero
    // despista: el motivo real es que ahí no pinta nada.
    expect(() =>
      exigirAudiencia({ orgType: 'GESTORIA', apps: [] }, SOLO_INTERNA, 'notaria'),
    ).toThrow(/no admite identidades/);
  });
});
