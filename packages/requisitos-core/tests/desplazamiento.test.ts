// 8-oct-2026: la regla más específica desplaza a la general SÓLO SI LA CUBRE. Antes bastaba la
// coordenada (documento, comunidad y ejes cond*), y una regla del acto más estrecha se llevaba por
// delante un requisito de la transversal.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';
import type { ReglaGolden } from '../src/puerto';

const resolver = (reglas: ReglaGolden[], hechos = {}) =>
  resolverRequisitos(repo({ tiposObjeto: TIPOS_OBJETO, reglas }), '0501', hechos);
const vivas = (r: Awaited<ReturnType<typeof resolver>>) =>
  [...r.firmes, ...r.condicionados, ...r.descartados].map((x) => x.codigo).sort();

const general = (p: Partial<ReglaGolden> = {}) =>
  regla({ codigo: 'GENERAL', documentoCodigo: 'REQ_X', ambito: 'TODOS', actoCodigo: null as never, ...p });
const delActo = (p: Partial<ReglaGolden> = {}) => regla({ codigo: 'DEL_ACTO', documentoCodigo: 'REQ_X', ...p });

describe('la específica desplaza a la general sólo si la cubre', () => {
  it('sin condiciones ni roles: desplaza (como siempre)', async () => {
    const r = await resolver([general(), delActo()]);
    expect(vivas(r)).toEqual(['DEL_ACTO']);
    expect(r.diagnostico.desplazadasPorEspecificidad).toBe(1);
  });

  it('las mismas condiciones: desplaza', async () => {
    const c = [cond('ACTO', 'HAY_AUTOCONTRATACION_O_CONFLICTO', 'EQ', true)];
    const r = await resolver([general({ condiciones: c }), delActo({ condiciones: c })]);
    expect(vivas(r)).toEqual(['DEL_ACTO']);
  });

  it('0507: la del acto sólo para casados NO desplaza al título previo de todos', async () => {
    const r = await resolver([
      general({ ambito: 'SUBFAMILIA' }),
      delActo({ condiciones: [cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO')] }),
    ]);
    expect(vivas(r)).toEqual(['DEL_ACTO', 'GENERAL']);
    expect(r.diagnostico.desplazadasPorEspecificidad).toBe(0);
  });

  it('0701: la del acto sólo para el DONATARIO NO desplaza al poder de cualquier interviniente', async () => {
    const r = await resolver([general(), delActo({ roles: [{ rolCodigo: 'DONATARIO', sujetoTipoCodigo: null }] })]);
    expect(vivas(r)).toEqual(['DEL_ACTO', 'GENERAL']);
  });

  it('roles que abarcan: la del acto para DISPONENTE desplaza a la general para VENDEDOR', async () => {
    const r = await resolver([
      general({ roles: [{ rolCodigo: 'VENDEDOR', sujetoTipoCodigo: null }] }),
      delActo({ roles: [{ rolCodigo: 'DISPONENTE', sujetoTipoCodigo: null }] }),
    ]);
    expect(vivas(r)).toEqual(['DEL_ACTO']);
  });

  it('el tipo base del acto no estrecha: [INMUEBLE] en una compraventa desplaza a la general sin tipo', async () => {
    const r = await resolver([general(), delActo({ objetos: [{ objetoTipoCodigo: 'INMUEBLE' }] })]);
    expect(vivas(r)).toEqual(['DEL_ACTO']);
  });

  it('un tipo de bien más estrecho que el del acto NO desplaza a la general', async () => {
    const r = await resolver([
      general(),
      delActo({ objetos: [{ objetoTipoCodigo: 'RUSTICA' }] }),
      regla({ codigo: 'OTRA', documentoCodigo: 'REQ_Y', objetos: [{ objetoTipoCodigo: 'INMUEBLE' }] }),
    ]);
    expect(vivas(r)).toEqual(['DEL_ACTO', 'GENERAL', 'OTRA']);
  });

  it('la del acto sin condiciones cubre a una general condicionada: desplaza', async () => {
    const r = await resolver([general({ condiciones: [cond('SUJETO', 'ES_MENOR', 'EQ', true)] }), delActo()]);
    expect(vivas(r)).toEqual(['DEL_ACTO']);
  });
});
