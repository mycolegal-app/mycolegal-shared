// Escenarios base subidos desde Consultor (9-oct-2026): mismo comportamiento, ahora para todas
// las apps, más la elección por esquema DocFilling que necesita el Redactor.
import { describe, it, expect } from 'vitest';
import { escenarioPara, escenariosDelActo, presuncionesDe } from '../src/escenario';
import { repo, TIPOS_OBJETO } from './ayuda';
import type { FilaEscenario, FilaTransversal, RepositorioRequisitos } from '../src/puerto';

const esc = (p: Partial<FilaEscenario>): FilaEscenario => ({
  actoCodigo: '0501', codigo: 'X', nombre: 'X', porDefecto: false, objetoTipoCodigo: null, esquemasDocFilling: [],
  estado: 'BORRADOR', revisadoPor: null, condiciones: [], presunciones: [], ...p,
});
const tr = (p: Partial<FilaTransversal>): FilaTransversal => ({
  ambito: 'TODOS', fichero: 'GLOBAL', fact: 'F', modo: 'PRESUMIR', valor: false, objetoTipoCodigo: '', ccaaCodigo: '',
  tema: null, situacion: null, porQue: null, ...p,
});
const conEscenarios = (escs: FilaEscenario[], trans: FilaTransversal[] = []): RepositorioRequisitos => ({
  ...repo({ tiposObjeto: TIPOS_OBJETO }),
  async escenariosDeActo() { return escs; },
  async presuncionesTransversales() { return trans; },
});

const PH = esc({ codigo: 'VIVIENDA_PH', porDefecto: true, objetoTipoCodigo: 'VIVIENDA', esquemasDocFilling: ['0501_ESQUEMA_MAESTRO_VIVIENDA_PH'],
  presunciones: [{ fact: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', modo: 'PRESUMIR', valor: true, tema: null, situacion: null, porQue: null },
    { fact: 'SUJETO.ESTADO_CIVIL', modo: 'PREGUNTAR', valor: null, tema: null, situacion: null, porQue: null }] });
const RUS = esc({ codigo: 'RUSTICA', objetoTipoCodigo: 'RUSTICA', esquemasDocFilling: ['0501_ESQUEMA_MAESTRO_FINCA_RUSTICA_v1'] });

describe('escenarios base en requisitos-core', () => {
  it('un repositorio sin los métodos nuevos: sin escenario, como antes de 0.4.0', async () => {
    expect(await escenarioPara(repo(), '0501')).toBeNull();
  });

  it('elige por esquema DocFilling (lo que sabe el Redactor)', async () => {
    const e = await escenarioPara(conEscenarios([PH, RUS]), '0501', { esquema: '0501_ESQUEMA_MAESTRO_FINCA_RUSTICA_v1' });
    expect(e?.codigo).toBe('RUSTICA');
    expect(e?.como).toBe('POR_ESQUEMA');
  });

  it('sin nada, el por defecto; por tipo de objeto, el ancestro más cercano', async () => {
    const r = conEscenarios([PH, RUS]);
    expect((await escenarioPara(r, '0501'))?.codigo).toBe('VIVIENDA_PH');
    expect((await escenarioPara(r, '0501', { tipoObjeto: 'RUSTICA' }))?.como).toBe('POR_TIPO');
  });

  it('hereda las transversales debajo del escenario, que manda', async () => {
    const e = await escenarioPara(conEscenarios([PH], [
      tr({ fact: 'SUJETO.COMPARECENCIA', valor: 'PERSONALMENTE' }),
      tr({ fact: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', valor: false }),        // la pisa el escenario
      tr({ fact: 'SUJETO.ESTADO_CIVIL', valor: 'SOLTERO' }),               // el escenario la pregunta
      tr({ fact: 'SUJETO.VECINDAD_CIVIL', modo: 'PREGUNTAR' }),
    ]), '0501');
    const p = presuncionesDe(e);
    expect(p['SUJETO.COMPARECENCIA']).toBe('PERSONALMENTE');
    expect(p['OBJETO.EN_PROPIEDAD_HORIZONTAL']).toBe(true);
    expect('SUJETO.ESTADO_CIVIL' in p).toBe(false);
    expect(p['OBJETO.TIPO']).toBe('VIVIENDA');
    expect(e?.preguntarSiempre.map((q) => q.fact).sort()).toEqual(['SUJETO.ESTADO_CIVIL', 'SUJETO.VECINDAD_CIVIL']);
  });

  it('acto sin escenario propio: «Caso general» con lo heredado', async () => {
    const lista = await escenariosDelActo(conEscenarios([], [tr({ fact: 'SUJETO.ES_MENOR', valor: false })]), '0203');
    expect(lista.map((e) => e.codigo)).toEqual(['BASE']);
    expect(presuncionesDe(lista[0])['SUJETO.ES_MENOR']).toBe(false);
  });

  it('la familia gana a GLOBAL y la autonómica sólo con su comunidad', async () => {
    const r = conEscenarios([], [
      tr({ fact: 'ACTO.HAY_PAGO_DINERARIO', valor: false }),
      tr({ ambito: 'FAMILIA', fichero: 'F05', fact: 'ACTO.HAY_PAGO_DINERARIO', valor: true }),
      tr({ fact: 'SUJETO.VECINDAD_CIVIL', valor: 'CATALANA', ccaaCodigo: '09' }),
    ]);
    expect(presuncionesDe(await escenarioPara(r, '0503'))['ACTO.HAY_PAGO_DINERARIO']).toBe(true);
    expect('SUJETO.VECINDAD_CIVIL' in presuncionesDe(await escenarioPara(r, '0503'))).toBe(false);
    expect(presuncionesDe(await escenarioPara(r, '0503', { ccaaCodigo: '09' }))['SUJETO.VECINDAD_CIVIL']).toBe('CATALANA');
  });

  it('una presunción acotada a un tipo de bien no vale para otro', async () => {
    const r = conEscenarios([RUS], [tr({ fact: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', valor: true, objetoTipoCodigo: 'URBANO' })]);
    expect('OBJETO.EN_PROPIEDAD_HORIZONTAL' in presuncionesDe(await escenarioPara(r, '0501'))).toBe(false);
  });

  it('los ajustes de la notaría mandan, el del caso sobre el de *', async () => {
    const r: RepositorioRequisitos = {
      ...conEscenarios([PH]),
      async ajustesDePresuncion() {
        return [
          { id: 'a', escenarioCodigo: '*', fact: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', modo: 'PREGUNTAR', valor: null, motivo: null },
          { id: 'b', escenarioCodigo: 'VIVIENDA_PH', fact: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', modo: 'PRESUMIR', valor: false, motivo: 'm' },
        ];
      },
    };
    const e = await escenarioPara(r, '0501', { orgId: 'org' });
    expect(presuncionesDe(e)['OBJETO.EN_PROPIEDAD_HORIZONTAL']).toBe(false);
    expect(e?.ajustes).toBe(1);
  });
});
