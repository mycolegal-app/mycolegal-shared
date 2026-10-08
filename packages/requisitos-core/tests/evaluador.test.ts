// El evaluador por IA (F2), con un modelo de mentira: lo que se prueba es el contrato —
// manda el motor, sin cita no hay dato, no se pisa lo que dijo una persona, se reutiliza
// lo que no cambió—, no lo que contestaría un modelo de verdad.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos } from '../src/motor';
import { evaluarCaso, evaluarRequisitos, anadirDatos, citaEnFuente, numerarFuentes, type RequisitoAEvaluar, type ContextoEvaluacion } from '../src/evaluador';
import { regla, cond, repo, TIPOS_OBJETO, TIPOS_SUJETO } from './ayuda';

const BASE = { tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO };
const ctx = (textos: string[]): ContextoEvaluacion => ({
  modo: 'PREPARACION', acto: { codigo: '0501', nombre: 'Compraventa' },
  fuentes: numerarFuentes(textos.map((t, i) => ({ nombre: `Fuente ${i + 1}`, texto: t }))),
});
const describir = (r: { codigo: string; descripcion: string | null; condicionesTexto: string[]; tipo: string }, situacion: RequisitoAEvaluar['situacion']): RequisitoAEvaluar => ({
  codigo: r.codigo, situacion, titulo: r.descripcion ?? r.codigo, clase: 'DOCUMENTO', aporta: 'CLIENTE',
  tratamiento: null, obligatorio: r.tipo === 'OBLIGATORIO', exige: null, condicionesTexto: r.condicionesTexto, fundamento: [],
});
/** Un modelo que contesta siempre lo mismo y cuenta las llamadas. */
const modelo = (respuesta: unknown) => {
  const llamadas: string[] = [];
  const llm = async (_s: string, m: string) => { llamadas.push(m); return JSON.stringify(respuesta); };
  return { llm, llamadas };
};

describe('evaluador', () => {
  const ph = regla({ codigo: 'CERT_COMUNIDAD', condiciones: [cond('OBJETO', 'EN_PROPIEDAD_HORIZONTAL', 'EQ', true)] });
  const fuente = 'Finca integrante de un edificio en régimen de propiedad horizontal, piso segundo.';

  it('los datos con cita verificada vuelven al motor, y es el motor quien lo pasa a «aplica»', async () => {
    const { llm } = modelo({ evaluaciones: [{
      codigo: 'CERT_COMUNIDAD', cumplido: 'NO', evidencia: [], falta: 'Certificado del secretario',
      datos: [{ dato: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', valor: 'SI', rol: null, fuente: 'F1', cita: 'en régimen de propiedad horizontal', confianza: 'alta' }],
    }] });
    const r = await evaluarCaso({
      hechos: {}, resolver: (h) => resolverRequisitos(repo({ ...BASE, reglas: [ph] }), '0501', h),
      describir, contexto: ctx([fuente]), llm,
    });
    expect(r.resultado.firmes.map((x) => x.codigo)).toEqual(['CERT_COMUNIDAD']);
    expect(r.evaluaciones[0]).toMatchObject({ codigo: 'CERT_COMUNIDAD', cumplido: 'NO', falta: 'Certificado del secretario' });
  });

  it('una cita que no está en la fuente se tira, y un SI sin prueba baja a NS', async () => {
    const { llm } = modelo({ evaluaciones: [{
      codigo: 'CERT_COMUNIDAD', cumplido: 'SI', evidencia: [{ fuente: 'F1', cita: 'se aporta certificado de la comunidad' }],
      datos: [{ dato: 'OBJETO.EN_PROPIEDAD_HORIZONTAL', valor: 'SI', fuente: 'F1', cita: 'edificio de doce plantas', confianza: 'alta' }],
    }] });
    const r = await evaluarCaso({
      hechos: {}, resolver: (h) => resolverRequisitos(repo({ ...BASE, reglas: [ph] }), '0501', h),
      describir, contexto: ctx([fuente]), llm,
    });
    expect(r.resultado.condicionados.map((x) => x.codigo)).toEqual(['CERT_COMUNIDAD']);
    expect(r.evaluaciones[0].cumplido).toBe('NS');
    expect(r.evaluaciones[0].citasDescartadas).toBe(2);
  });

  it('los descartados por el motor no se evalúan', async () => {
    const { llm, llamadas } = modelo({ evaluaciones: [] });
    await evaluarCaso({
      hechos: { objetos: [{ id: 'o', tipo: null, hechos: { EN_PROPIEDAD_HORIZONTAL: false } }] },
      resolver: (h) => resolverRequisitos(repo({ ...BASE, reglas: [ph] }), '0501', h),
      describir, contexto: ctx([fuente]), llm,
    });
    expect(llamadas).toHaveLength(0);
  });

  it('un dato de la IA no pisa lo que dijo una persona', () => {
    const h = anadirDatos(
      { sujetos: [{ id: 'v', rol: 'VENDEDOR', tipo: null, hechos: { ESTADO_CIVIL: 'SOLTERO' } }] },
      [{ dato: 'SUJETO.ESTADO_CIVIL', valor: 'CASADO', rol: 'VENDEDOR', fuente: 'F1', cita: 'x', confianza: 'alta' },
       { dato: 'SUJETO.ESTADO_CIVIL', valor: 'CASADO', rol: 'COMPRADOR', fuente: 'F1', cita: 'x', confianza: 'alta' },
       { dato: 'ACTO.CAUSA', valor: 'RENUNCIA_HERENCIA', rol: null, fuente: 'F1', cita: 'x', confianza: 'baja' }],
    );
    expect(h.sujetos!.find((s) => s.rol === 'VENDEDOR')!.hechos.ESTADO_CIVIL).toBe('SOLTERO');
    expect(h.sujetos!.find((s) => s.rol === 'COMPRADOR')!.hechos.ESTADO_CIVIL).toBe('CASADO');
    expect(h.acto!.CAUSA).toBeUndefined();   // confianza baja: no entra
  });

  it('sin cambios en las fuentes, no se vuelve a llamar al modelo', async () => {
    const req: RequisitoAEvaluar = describir({ codigo: 'X', descripcion: 'X', condicionesTexto: [], tipo: 'OBLIGATORIO' }, 'APLICA');
    const { llm, llamadas } = modelo({ evaluaciones: [{ codigo: 'X', cumplido: 'NS', datos: [], evidencia: [] }] });
    const c = ctx(['texto']);
    const a = await evaluarRequisitos([req], c, { llm });
    const b = await evaluarRequisitos([req], c, { llm, previas: a.evaluaciones });
    expect(llamadas).toHaveLength(1);
    expect(b.reutilizadas).toBe(1);
    await evaluarRequisitos([req], ctx(['texto nuevo']), { llm, previas: a.evaluaciones });
    expect(llamadas).toHaveLength(2);
  });

  it('las citas se comparan sin acentos, comillas ni espacios, y admiten un recorte con «…»', () => {
    const f = 'Comparece DOÑA MARÍA LÓPEZ, casada en régimen de gananciales, con D.N.I. número 12345678Z y vecina de Lleida.';
    expect(citaEnFuente('casada en  regimen de gananciales', f)).toBe(true);
    expect(citaEnFuente('Comparece DOÑA MARÍA LÓPEZ, casada en régimen … con D.N.I. número 12345678Z y vecina', f)).toBe(true);
    expect(citaEnFuente('casada en separación de bienes', f)).toBe(false);
  });
});
