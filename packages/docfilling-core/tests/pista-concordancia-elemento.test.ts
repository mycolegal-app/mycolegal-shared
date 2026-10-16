import { describe, it, expect } from 'vitest';
import { compose, expandirIncludes, repositorioDeMapa } from '../index';

// La pista de una concordancia dentro de un elemento de lista es la del elemento (certificación 0507, 16-oct-2026):
// «Doña Inés…, soltero» porque la concordancia, resuelta después de componer, buscaba el campo suelto.
describe('pista de concordancia en un elemento de lista', () => {
  const parr = { PARR_PF: '{{COMP_PF_NOMBRE}}, {{AUTO(COMP_PF_NOMBRE):soltero|soltera}} y {{AUTO(OTRO):x|y}}' };
  const datos = { LISTA: [{ COMP_PF_NOMBRE: 'Felipe' }, { COMP_PF_NOMBRE: 'Inés' }], COMP_PF_NOMBRE: 'Andrés' } as never;

  it('en un párrafo vinculado, la pista pasa a ser el valor de cada elemento', async () => {
    const exp = await expandirIncludes('{{FOR EACH ITEM IN LISTA}}\n{{INCLUDE PARR_PF FIELDS:(ITEM)}}\n{{ENDFOR}}', repositorioDeMapa(parr));
    const t = compose(exp.texto, datos);
    expect(t).toContain('Felipe, {{AUTO("Felipe"):soltero|soltera}}');
    expect(t).toContain('Inés, {{AUTO("Inés"):soltero|soltera}}');
    expect(t).not.toContain('Andrés');
    expect(t).toContain('{{AUTO(OTRO):x|y}}'); // una pista que no es del elemento no se toca
  });

  it('escrita con el iterador, igual', () => {
    expect(compose('{{FOR EACH P IN LISTA}}[{{AUTO(P.COMP_PF_NOMBRE):a|b}}]{{ENDFOR}}', datos)).toBe('[{{AUTO("Felipe"):a|b}}][{{AUTO("Inés"):a|b}}]');
  });
});
