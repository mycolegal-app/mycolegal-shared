// Los datos derivados (catálogo 1.1.63, 7-nov-2026): la situación del seguro decenal sale de
// tramos declarados en el catálogo, y la evalúa el motor, no una app.
import { describe, it, expect } from 'vitest';
import { resolverRequisitos, derivar, derivarHechos } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO } from './ayuda';
import type { DerivadoDef, NodoTipo, RepositorioRequisitos } from '../src/puerto';

const TIPOS_SUJETO: NodoTipo[] = [
  { codigo: 'SUJETO', parentCodigo: null },
  { codigo: 'PERSONA_FISICA', parentCodigo: 'SUJETO' },
  { codigo: 'PERSONA_JURIDICA', parentCodigo: 'SUJETO' },
];

/** Los cuatro tramos de ACTO.SITUACION_SEGURO_DECENAL del catálogo 1.1.63. */
const SEGURO: DerivadoDef = {
  fact: 'ACTO.SITUACION_SEGURO_DECENAL',
  tramos: [
    { valor: 'EXENTO_NO_VIVIENDA', porQue: 'no es vivienda', si: [{ fact: 'OBJETO.DESTINO_PRINCIPAL_VIVIENDA', op: 'EQ', valor: false, scopeRol: null, paraTipo: null }] },
    { valor: 'EXENTO_TEMPORAL', porQue: 'más de diez años', si: [{ fact: 'OBJETO.ANTIGUEDAD_ANOS', op: 'GT', valor: 10, scopeRol: null, paraTipo: null }] },
    { valor: 'EXENTO_AUTOPROMOTOR_USO_PROPIO', porQue: 'autopromotor', si: [{ fact: 'SUJETO.ES_AUTOPROMOTOR_USO_PROPIO', op: 'EQ', valor: true, scopeRol: null, paraTipo: 'PERSONA_FISICA' }] },
    { valor: 'OBLIGATORIO', porQue: 'vivienda de diez años o menos', si: [
      { fact: 'OBJETO.DESTINO_PRINCIPAL_VIVIENDA', op: 'EQ', valor: true, scopeRol: null, paraTipo: null },
      { fact: 'OBJETO.ANTIGUEDAD_ANOS', op: 'LTE', valor: 10, scopeRol: null, paraTipo: null },
    ] },
  ],
};
const esUn = (tipo: string | null | undefined, exigido: string) =>
  !!tipo && (tipo === exigido || (exigido === 'SUJETO' && tipo.startsWith('PERSONA')));
const valor = (hechos: Parameters<typeof derivar>[1], pres: Record<string, unknown> = {}) =>
  derivar([SEGURO], hechos, pres, { esUn })[0]?.valor ?? null;
const casa = (antiguedad: number | undefined, vivienda: boolean | undefined = true) =>
  ({ id: 'b', tipo: 'EDIFICIO', hechos: { ...(antiguedad === undefined ? {} : { ANTIGUEDAD_ANOS: antiguedad }), ...(vivienda === undefined ? {} : { DESTINO_PRINCIPAL_VIVIENDA: vivienda }) } });
const pf = (hechos: Record<string, unknown> = {}) => ({ id: 's', rol: 'DECLARANTE', tipo: 'PERSONA_FISICA', hechos });

describe('derivar: los tramos en orden, el primero que se cumple', () => {
  it('Can Marcet (1978, en 2026): más de diez años', () => {
    expect(valor({ objetos: [casa(48)], sujetos: [pf()] })).toBe('EXENTO_TEMPORAL');
  });
  it('no es vivienda: exento, sin mirar la antigüedad', () => {
    expect(valor({ objetos: [casa(undefined, false)], sujetos: [pf()] })).toBe('EXENTO_NO_VIVIENDA');
  });
  it('2016 en 2026 (diez justos): obligatorio si no es autopromotor', () => {
    expect(valor({ objetos: [casa(10)], sujetos: [pf({ ES_AUTOPROMOTOR_USO_PROPIO: false })] })).toBe('OBLIGATORIO');
    expect(valor({ objetos: [casa(10)], sujetos: [pf({ ES_AUTOPROMOTOR_USO_PROPIO: true })] })).toBe('EXENTO_AUTOPROMOTOR_USO_PROPIO');
  });
  it('una sociedad promotora: el autopromotor no existe para ella (NO_APLICA) y es obligatorio', () => {
    expect(valor({ objetos: [casa(5)], sujetos: [{ id: 's', rol: 'DECLARANTE', tipo: 'PERSONA_JURIDICA', hechos: {} }] })).toBe('OBLIGATORIO');
  });
  it('un tramo que no se sabe PARA: persona física sin contestar la autopromoción no llega a «obligatorio»', () => {
    expect(valor({ objetos: [casa(5)], sujetos: [pf()] })).toBeNull();
  });
  it('sin la antigüedad para en el segundo tramo, aunque sea vivienda', () => {
    expect(valor({ objetos: [casa(undefined)], sujetos: [pf({ ES_AUTOPROMOTOR_USO_PROPIO: false })] })).toBeNull();
  });
  it('lo que presume el caso cuenta donde falta el dato (destino vivienda)', () => {
    expect(valor({ objetos: [casa(5, undefined)], sujetos: [pf({ ES_AUTOPROMOTOR_USO_PROPIO: false })] }, { 'OBJETO.DESTINO_PRINCIPAL_VIVIENDA': true })).toBe('OBLIGATORIO');
  });
  it('lo contestado manda: no se deriva', () => {
    expect(valor({ acto: { SITUACION_SEGURO_DECENAL: 'OBLIGATORIO' }, objetos: [casa(48)], sujetos: [pf()] })).toBeNull();
  });
});

describe('resolverRequisitos con datos derivados', () => {
  const r25 = regla({ codigo: 'R25', condiciones: [cond('ACTO', 'SITUACION_SEGURO_DECENAL', 'EQ', 'OBLIGATORIO', { tipoDato: 'LISTA' })] });
  const r26 = regla({ codigo: 'R26', condiciones: [cond('ACTO', 'SITUACION_SEGURO_DECENAL', 'NE', 'OBLIGATORIO', { tipoDato: 'LISTA' })] });
  const conDerivados = (defs: DerivadoDef[]): RepositorioRequisitos => ({
    ...repo({ reglas: [r25, r26], tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO }),
    async derivados() { return defs; },
  });

  it('lo derivado decide las reglas, pesa más que el caso y se devuelve con su porqué', async () => {
    const r = await resolverRequisitos(conDerivados([SEGURO]), '0405', { objetos: [casa(48)], sujetos: [pf()] },
      { presunciones: { 'ACTO.SITUACION_SEGURO_DECENAL': 'OBLIGATORIO' } });
    expect(r.firmes.map((x) => x.codigo)).toEqual(['R26']);
    expect(r.descartados.map((x) => x.codigo)).toEqual(['R25']);
    expect(r.derivados).toEqual([{ fact: 'ACTO.SITUACION_SEGURO_DECENAL', valor: 'EXENTO_TEMPORAL', porQue: 'más de diez años' }]);
    expect(r.firmes[0].porPresuncion).toContain('ACTO.SITUACION_SEGURO_DECENAL');
  });

  it('sin derivados en el repositorio, como siempre: se pregunta', async () => {
    const r = await resolverRequisitos(repo({ reglas: [r25, r26], tiposObjeto: TIPOS_OBJETO }), '0405', { objetos: [casa(48)] });
    expect(r.preguntas.map((p) => p.fact)).toEqual(['ACTO.SITUACION_SEGURO_DECENAL']);
    expect(r.derivados).toEqual([]);
  });

  it('derivarHechos da lo mismo sin resolver el acto', async () => {
    const d = await derivarHechos(conDerivados([SEGURO]), { objetos: [casa(48)], sujetos: [pf()] });
    expect(d.map((x) => x.valor)).toEqual(['EXENTO_TEMPORAL']);
  });
});

describe('un tramo en duda pregunta lo que falta en él (0.3.13)', () => {
  const r25 = regla({ codigo: 'R25', condiciones: [cond('ACTO', 'SITUACION_SEGURO_DECENAL', 'EQ', 'OBLIGATORIO', { tipoDato: 'LISTA' })] });
  const conDef: DerivadoDef = {
    ...SEGURO,
    tramos: SEGURO.tramos.map((t) => ({ ...t, si: t.si.map((c) => ({ ...c, def: { label: c.fact, tipoDato: 'BOOL', opciones: null, fuentePreferente: null } })) })),
  };
  const repoCon = (defs: DerivadoDef[]): RepositorioRequisitos => ({
    ...repo({ reglas: [r25], tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO }),
    async derivados() { return defs; },
  });

  it('persona física sin contestar la autopromoción: se pregunta la autopromoción, de ella, y no la situación', async () => {
    const r = await resolverRequisitos(repoCon([conDef]), '0405', { objetos: [casa(5)], sujetos: [pf()] }, { preguntasPorSujeto: true });
    expect(r.preguntas.map((p) => p.fact)).toEqual(['SUJETO.ES_AUTOPROMOTOR_USO_PROPIO']);
    expect(r.preguntas[0].sujetoId).toBe('s');
    expect(r.preguntas[0].bloquea).toEqual(['R25']);
    expect(r.condicionados[0].faltan).toEqual(['SUJETO.ES_AUTOPROMOTOR_USO_PROPIO']);
  });

  it('sin la antigüedad, se pregunta la antigüedad del bien', async () => {
    const r = await resolverRequisitos(repoCon([conDef]), '0405', { objetos: [casa(undefined)], sujetos: [pf()] }, { preguntasPorSujeto: true });
    expect(r.preguntas.map((p) => [p.fact, p.objetoId])).toEqual([['OBJETO.ANTIGUEDAD_ANOS', 'b']]);
  });

  it('contestada la situación, manda y no se pregunta nada', async () => {
    const r = await resolverRequisitos(repoCon([conDef]), '0405', { acto: { SITUACION_SEGURO_DECENAL: 'OBLIGATORIO' }, objetos: [casa(5)], sujetos: [pf()] });
    expect(r.preguntas).toEqual([]);
    expect(r.firmes.map((x) => x.codigo)).toEqual(['R25']);
  });

  it('sin saber cómo preguntar lo del tramo (repositorio sin def), se pregunta el derivado, como en 0.3.12', async () => {
    const r = await resolverRequisitos(repoCon([SEGURO]), '0405', { objetos: [casa(5)], sujetos: [pf()] });
    expect(r.preguntas.map((p) => p.fact)).toEqual(['ACTO.SITUACION_SEGURO_DECENAL']);
  });
});

describe('un dato que se pregunta por otro: la antigüedad, por el año de terminación (0.3.14)', () => {
  const r25 = regla({ codigo: 'R25', condiciones: [cond('ACTO', 'SITUACION_SEGURO_DECENAL', 'EQ', 'OBLIGATORIO', { tipoDato: 'LISTA' })] });
  const rAnt = regla({ codigo: 'RANT', condiciones: [cond('OBJETO', 'ANTIGUEDAD_ANOS', 'GT', 10, { tipoDato: 'NUMERO' })] });
  const conDef: DerivadoDef = {
    ...SEGURO,
    tramos: SEGURO.tramos.map((t) => ({ ...t, si: t.si.map((c) => ({ ...c, def: { label: c.fact, tipoDato: 'BOOL', opciones: null, fuentePreferente: null } })) })),
  };
  const ANO = { fact: 'OBJETO.ANTIGUEDAD_ANOS', por: 'OBJETO.ANO_TERMINACION_OBRA', def: { label: 'Año de terminación de la obra', tipoDato: 'NUMERO', opciones: null, fuentePreferente: null } };
  const repoCon = (reglas: typeof r25[], conPor: boolean): RepositorioRequisitos => ({
    ...repo({ reglas, tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO }),
    async derivados() { return [conDef]; },
    ...(conPor ? { async preguntasPor() { return [ANO]; } } : {}),
  });

  it('un tramo en duda por la antigüedad pregunta el AÑO del bien, con su rótulo', async () => {
    const r = await resolverRequisitos(repoCon([r25], true), '0405', { objetos: [casa(undefined)], sujetos: [pf()] }, { preguntasPorSujeto: true });
    expect(r.preguntas.map((p) => [p.fact, p.objetoId, p.label])).toEqual([['OBJETO.ANO_TERMINACION_OBRA', 'b', 'Año de terminación de la obra']]);
    expect(r.condicionados[0].faltan).toEqual(['OBJETO.ANO_TERMINACION_OBRA']);
  });

  it('una regla con la antigüedad en su condición también pregunta el año', async () => {
    const r = await resolverRequisitos(repoCon([rAnt], true), '0405', { objetos: [casa(undefined)] }, { preguntasPorSujeto: true });
    expect(r.preguntas.map((p) => [p.fact, p.objetoId])).toEqual([['OBJETO.ANO_TERMINACION_OBRA', 'b']]);
  });

  it('sin preguntaPor en el repositorio, se pregunta la antigüedad, como en 0.3.13', async () => {
    const r = await resolverRequisitos(repoCon([r25], false), '0405', { objetos: [casa(undefined)], sujetos: [pf()] }, { preguntasPorSujeto: true });
    expect(r.preguntas.map((p) => p.fact)).toEqual(['OBJETO.ANTIGUEDAD_ANOS']);
  });
});
