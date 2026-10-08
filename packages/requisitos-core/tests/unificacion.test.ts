// Lo que el motor de Consultor sabía y el paquete no, hasta la unificación del 8-oct-2026
// (PLAN_TECNICO_EVALUACION_REQUISITOS_IA, F0): transversales con precedencia por
// especificidad, los ejes causa y medio de pago, y su convivencia con la jerarquía de roles,
// que sólo tenía el paquete.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos, FACT_CAUSA, FACT_MEDIO_PAGO } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO, TIPOS_SUJETO } from './ayuda';

const BASE = { tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO };

describe('unificación con el motor de Consultor', () => {
  it('una transversal de TODOS sale, y la del acto que pide lo mismo la desplaza', async () => {
    const reglas = [
      regla({ codigo: 'T-DNI', documentoCodigo: 'DNI', ambito: 'TODOS', actoCodigo: null }),
      regla({ codigo: 'A-DNI', documentoCodigo: 'DNI', ambito: 'ACTO' }),
      regla({ codigo: 'T-NIF', documentoCodigo: 'NIF_REVOCADO', ambito: 'TODOS', actoCodigo: null }),
    ];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {});
    expect(r.firmes.map((x) => x.codigo).sort()).toEqual(['A-DNI', 'T-NIF']);
    expect(r.diagnostico.desplazadasPorEspecificidad).toBe(1);
    expect(r.diagnostico.transversales).toBe(2);
    expect(r.firmes.find((x) => x.codigo === 'T-NIF')!.ambito).toBe('TODOS');
  });

  it('la causa decide: sin saberla, EN DUDA y se pregunta; con otra causa, descartada', async () => {
    const reglas = [regla({ codigo: 'RENUNCIA', condCausa: 'RENUNCIA_HERENCIA' })];
    let r = await resolverRequisitos(repo({ ...BASE, reglas }), '1104', {});
    expect(r.condicionados.map((x) => x.codigo)).toEqual(['RENUNCIA']);
    expect(r.preguntas.map((p) => p.fact)).toEqual([FACT_CAUSA]);
    r = await resolverRequisitos(repo({ ...BASE, reglas }), '1104', { acto: { CAUSA: 'RENUNCIA_LEGADO' } });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['RENUNCIA']);
    r = await resolverRequisitos(repo({ ...BASE, reglas }), '1104', { acto: { CAUSA: 'RENUNCIA_HERENCIA' } });
    expect(r.firmes.map((x) => x.codigo)).toEqual(['RENUNCIA']);
  });

  it('el medio de pago admite una lista: se paga, entre otros, con cheque', async () => {
    const reglas = [regla({ codigo: 'TESTIMONIO_CHEQUE', condMedioPago: 'CHEQUE' })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      acto: { MEDIO_PAGO: ['TRANSFERENCIA', 'CHEQUE'] },
    });
    expect(r.firmes.map((x) => x.codigo)).toEqual(['TESTIMONIO_CHEQUE']);
    expect(r.firmes[0].hechosQueDecide).toContain(FACT_MEDIO_PAGO);
  });

  it('la causa se combina con AND con las condiciones, no como un grupo alternativo', async () => {
    const reglas = [regla({
      codigo: 'X', condCausa: 'RENUNCIA_HERENCIA',
      condiciones: [cond('SUJETO', 'ES_MENOR', 'EQ', true)],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '1104', {
      acto: { CAUSA: 'RENUNCIA_LEGADO' },
      sujetos: [{ id: 's', rol: 'RENUNCIANTE', tipo: 'PERSONA_FISICA', hechos: { ES_MENOR: true } }],
    });
    expect(r.descartados.map((x) => x.codigo)).toEqual(['X']);
  });

  it('una condición acotada a DISPONENTE alcanza al VENDEDOR (herencia de roles)', async () => {
    const reglas = [regla({
      codigo: 'CONSENTIMIENTO_CONYUGE',
      condiciones: [cond('SUJETO', 'ESTADO_CIVIL', 'EQ', 'CASADO', { scopeRolCodigo: 'DISPONENTE' })],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      sujetos: [{ id: 'v', rol: 'VENDEDOR', tipo: 'PERSONA_FISICA', hechos: { ESTADO_CIVIL: 'CASADO' } }],
    });
    expect(r.firmes.map((x) => x.codigo)).toEqual(['CONSENTIMIENTO_CONYUGE']);
  });
});
