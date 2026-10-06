// El motor de requisitos, probado SIN base de datos.
//
// Cada test fija una conducta que importa, y varias de ellas sólo se podían
// comprobar antes sembrando el golden entero. La jerarquía is-a es el ejemplo: su
// fallo «se ve sólo al contar instancias, no al contar requisitos» —la regla
// aparece en la lista y no materializa nada—, y ahora se prueba en tres líneas.
import { describe, it, expect, vi } from 'vitest';
import { resolverRequisitos, FACT_TIPO_OBJETO } from '../src/motor';
import { regla, cond, repo, TIPOS_OBJETO, TIPOS_SUJETO } from './ayuda';

const BASE = { tiposObjeto: TIPOS_OBJETO, tiposSujeto: TIPOS_SUJETO };

/** Un objeto del expediente. Los hechos de ámbito OBJETO viven DENTRO de él, no en una
 *  bolsa plana: es lo que permite «este piso sí tiene cédula y aquel no». */
const obj = (id: string, tipo: string | null, hechos: Record<string, unknown> = {}) =>
  ({ id, tipo, hechos });

describe('resolverRequisitos', () => {
  it('una regla sin condiciones es FIRME y no pide nada', async () => {
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({ codigo: 'DNI' })] }), '0501', {},
    );
    expect(r.firmes.map((x) => x.codigo)).toEqual(['DNI']);
    expect(r.preguntas).toEqual([]);
    expect(r.firmes[0].condicionada).toBe(false);
  });

  it('una condición sin el hecho deja el requisito CONDICIONADO y genera su pregunta', async () => {
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({
        codigo: 'CERT_EFICIENCIA',
        condiciones: [cond('OBJETO', 'ES_VIVIENDA', 'EQ', true)],
      })] }),
      '0501', {},
    );
    expect(r.firmes).toEqual([]);
    expect(r.condicionados.map((x) => x.codigo)).toEqual(['CERT_EFICIENCIA']);
    expect(r.condicionados[0].faltan).toEqual(['OBJETO.ES_VIVIENDA']);
    // La pregunta trae lo que hace falta para poder hacérsela a una persona.
    expect(r.preguntas).toHaveLength(1);
    expect(r.preguntas[0]).toMatchObject({
      fact: 'OBJETO.ES_VIVIENDA', label: 'OBJETO.ES_VIVIENDA', tipoDato: 'BOOLEANO',
      bloquea: ['CERT_EFICIENCIA'],
    });
  });

  it('con el hecho a favor pasa a firme; con el hecho en contra, descartado', async () => {
    const reglas = [regla({
      codigo: 'CERT', condiciones: [cond('OBJETO', 'ES_VIVIENDA', 'EQ', true)],
    })];
    const si = await resolverRequisitos(repo({ ...BASE, reglas }), '0501',
      { objetos: [obj('o1', 'VIVIENDA', { ES_VIVIENDA: true })] });
    const no = await resolverRequisitos(repo({ ...BASE, reglas }), '0501',
      { objetos: [obj('o1', 'RUSTICA', { ES_VIVIENDA: false })] });
    expect(si.firmes.map((x) => x.codigo)).toEqual(['CERT']);
    expect(no.firmes).toEqual([]);
    expect(no.descartados.map((x) => x.codigo)).toEqual(['CERT']);
  });

  it('⚠️ la jerarquía is-a: una VIVIENDA cumple una regla que pide INMUEBLE', async () => {
    // El defecto que esto previene no se ve contando requisitos: la regla sale en
    // la lista y genera CERO instancias. Es la nota simple y la referencia
    // catastral quedándose sin materializar.
    const reglas = [regla({
      codigo: 'NOTA_SIMPLE', scopeGeneracion: 'POR_OBJETO',
      objetos: [{ objetoTipoCodigo: 'INMUEBLE' }],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      objetos: [obj('o1', 'VIVIENDA')],
    });
    expect(r.firmes).toHaveLength(1);
    expect(r.firmes[0].instancias).toEqual([{ objetoId: 'o1' }]);
  });

  it('⚠️ la jerarquía is-a TAMBIÉN en el rol: un VENDEDOR cumple una regla escrita para DISPONENTE', async () => {
    // Hasta octubre de 2026 el rol se comparaba con `includes` sobre la cadena, y por eso las
    // 81 reglas que el curador colgó de ADQUIRENTE, DISPONENTE, CAUSAHABIENTE y HEREDERO —la
    // identidad, el titular real, la ficha notarial ATC, el AJD— no alcanzaban a ningún
    // expediente cuyo sujeto dijera VENDEDOR, COMPRADOR o HEREDERO. Mismo síntoma que tenía el
    // objeto: la regla sale en la lista y materializa cero instancias.
    const reglas = [regla({
      codigo: 'ACTIVO_ESENCIAL', scopeGeneracion: 'POR_SUJETO',
      roles: [{ rolCodigo: 'DISPONENTE', sujetoTipoCodigo: null }],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      sujetos: [{ id: 's1', rol: 'VENDEDOR', tipo: null, hechos: {} }],
    });
    expect(r.firmes).toHaveLength(1);
    expect(r.firmes[0].instancias).toEqual([{ sujetoId: 's1' }]);
  });

  it('y el rol de otra rama no la cumple: un COMPRADOR no es un DISPONENTE', async () => {
    const reglas = [regla({
      codigo: 'ACTIVO_ESENCIAL', scopeGeneracion: 'POR_SUJETO',
      roles: [{ rolCodigo: 'DISPONENTE', sujetoTipoCodigo: null }],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      sujetos: [{ id: 's1', rol: 'COMPRADOR', tipo: null, hechos: {} }],
    });
    expect(r.firmes[0].instancias).toEqual([]);
  });

  it('el nieto también: un TRANSMISARIO cumple una regla de CAUSAHABIENTE', async () => {
    // CAUSAHABIENTE → HEREDERO → TRANSMISARIO. Son las 42 reglas de la adjudicación sucesoria.
    const reglas = [regla({
      codigo: 'FICHA_ATC', scopeGeneracion: 'POR_SUJETO',
      roles: [{ rolCodigo: 'CAUSAHABIENTE', sujetoTipoCodigo: null }],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '1103', {
      sujetos: [{ id: 's1', rol: 'TRANSMISARIO', tipo: null, hechos: {} }],
    });
    expect(r.firmes[0].instancias).toEqual([{ sujetoId: 's1' }]);
  });

  it('y NO la cumple un tipo de otra rama', async () => {
    const reglas = [regla({
      codigo: 'URBANISTICO', scopeGeneracion: 'POR_OBJETO',
      objetos: [{ objetoTipoCodigo: 'URBANO' }],
    })];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      objetos: [obj('o1', 'RUSTICA')],
    });
    expect(r.firmes).toEqual([]);
    expect(r.descartados.map((x) => x.codigo)).toEqual(['URBANISTICO']);
  });

  it('la jurisdicción: lo estatal siempre, lo de otra comunidad nunca', async () => {
    const reglas = [
      regla({ codigo: 'ESTATAL', ccaaCodigo: '' }),
      regla({ codigo: 'CATALUNA', ccaaCodigo: '09' }),
      regla({ codigo: 'MADRID', ccaaCodigo: '13' }),
    ];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {}, { ccaaCodigo: '09' });
    expect(r.firmes.map((x) => x.codigo).sort()).toEqual(['CATALUNA', 'ESTATAL']);
    expect(r.diagnostico.descartadasPorJurisdiccion).toBe(1);
  });

  it('un delta de la comunidad con `sustituye` desplaza a su regla estatal', async () => {
    // Sin este paso el expediente pediría la estatal Y su delta: dos veces lo
    // mismo con dos fundamentos distintos.
    const reglas = [
      regla({ codigo: 'CEDULA', ccaaCodigo: '' }),
      regla({ codigo: 'CEDULA_CAT', ccaaCodigo: '09', modificaCodigo: 'CEDULA' }),
    ];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {}, { ccaaCodigo: '09' });
    expect(r.firmes.map((x) => x.codigo)).toEqual(['CEDULA_CAT']);
    expect(r.diagnostico.sustituidasPorDelta).toBe(1);
  });

  it('una presunción decide, y queda DICHO que fue una presunción', async () => {
    // Importa porque una presunción calla o impone documentos, y quien lee la
    // lista tiene que poder verlo y cambiarlo.
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({
        codigo: 'CERT', condiciones: [cond('OBJETO', 'ES_VIVIENDA', 'EQ', true)],
      })] }),
      '0501', {}, { presunciones: { 'OBJETO.ES_VIVIENDA': true } },
    );
    expect(r.firmes.map((x) => x.codigo)).toEqual(['CERT']);
    expect(r.firmes[0].porPresuncion).toEqual(['OBJETO.ES_VIVIENDA']);
  });

  it('un dato del expediente MANDA sobre la presunción', async () => {
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({
        codigo: 'CERT', condiciones: [cond('OBJETO', 'ES_VIVIENDA', 'EQ', true)],
      })] }),
      '0501',
      { objetos: [obj('o1', 'RUSTICA', { ES_VIVIENDA: false })] },
      { presunciones: { 'OBJETO.ES_VIVIENDA': true } },
    );
    expect(r.firmes).toEqual([]);
    expect(r.descartados[0].porPresuncion).toEqual([]);
  });

  it('el grupo de evidencia sale con su mínimo y sus alternativas', async () => {
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({
        codigo: 'IDENT', documentoCodigo: null,
        evidenciaGrupo: {
          codigo: 'IDENTIDAD', minRequerido: 1,
          documentos: [{ documentTypeCodigo: 'DNI' }, { documentTypeCodigo: 'NIE' }, { documentTypeCodigo: 'PASAPORTE' }],
        },
      })] }),
      '0501', {},
    );
    // «Vale cualquiera de estos tres»: pedir los tres sería hacer trabajar de más.
    expect(r.firmes[0].evidenciaGrupo).toEqual({
      codigo: 'IDENTIDAD', minRequerido: 1, documentos: ['DNI', 'NIE', 'PASAPORTE'],
    });
  });

  it('el fundamento conserva su orden, que es parte del dato', async () => {
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({
        codigo: 'X',
        fundamentos: [
          { normaBoeId: 'BOE-A-1', articulo: '28', nota: null },
          { normaBoeId: 'BOE-A-2', articulo: '98', nota: 'y la RDGSJFP' },
        ],
      })] }),
      '0501', {},
    );
    expect(r.firmes[0].fundamento.map((f) => f.articulo)).toEqual(['28', '98']);
  });

  it('la CAPA se decide con el puerto, y en `auto` cae a la básica si no hay golden', async () => {
    const espia = vi.fn();
    await resolverRequisitos(repo({ ...BASE, espia, conGolden: [] }), '0501', {});
    expect(espia).toHaveBeenCalledWith({ actoCodigo: '0501', estados: null, soloGolden: false });

    const espia2 = vi.fn();
    await resolverRequisitos(repo({ ...BASE, espia: espia2, conGolden: ['0501'] }), '0501', {});
    expect(espia2).toHaveBeenCalledWith({ actoCodigo: '0501', estados: null, soloGolden: true });
  });

  it('`capa: basica` no pregunta por el golden: se pide explícitamente', async () => {
    const espia = vi.fn();
    await resolverRequisitos(
      repo({ ...BASE, espia, conGolden: ['0501'] }), '0501', {}, { capa: 'basica' },
    );
    expect(espia).toHaveBeenCalledWith({ actoCodigo: '0501', estados: null, soloGolden: false });
  });

  it('los estados pedidos llegan al puerto tal cual', async () => {
    const espia = vi.fn();
    await resolverRequisitos(
      repo({ ...BASE, espia }), '0501', {}, { estados: ['REVISADO'] },
    );
    expect(espia).toHaveBeenCalledWith({ actoCodigo: '0501', estados: ['REVISADO'], soloGolden: false });
  });

  it('`hechosQueDecide` lleva TODO lo que la regla mira, no sólo lo que falta', async () => {
    // Es lo que una pantalla necesita para seguir enseñando el hecho después de
    // contestarlo; `faltan` es sólo lo que bloquea hoy.
    const r = await resolverRequisitos(
      repo({ ...BASE, reglas: [regla({
        codigo: 'X',
        condiciones: [cond('OBJETO', 'A', 'EQ', true), cond('SUJETO', 'B', 'EQ', true)],
      })] }),
      '0501', { objetos: [obj('o1', 'VIVIENDA', { A: true })] },
    );
    const x = [...r.firmes, ...r.condicionados, ...r.descartados][0];
    expect(x.hechosQueDecide.slice().sort()).toEqual(['OBJETO.A', 'SUJETO.B']);
    expect(x.faltan).toEqual(['SUJETO.B']);
  });

  it('⚠️ una regla acotada por tipo de objeto cuenta como CONDICIONADA', async () => {
    // Es lo que distingue un catálogo curado de la lista heredada, que lo pedía
    // todo siempre. Y «acota» es RELATIVO al acto: VIVIENDA sólo estrecha porque
    // otra regla del mismo acto pide INMUEBLE. Así el tipo base del acto se
    // deduce y no hace falta tenerlo en la base de datos.
    const reglas = [
      regla({ codigo: 'NOTA', objetos: [{ objetoTipoCodigo: 'INMUEBLE' }] }),
      regla({ codigo: 'CEDULA', objetos: [{ objetoTipoCodigo: 'VIVIENDA' }] }),
    ];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {
      objetos: [obj('o1', 'VIVIENDA')],
    });
    const nota = r.firmes.find((x) => x.codigo === 'NOTA')!;
    const cedula = r.firmes.find((x) => x.codigo === 'CEDULA')!;
    expect(nota.condicionada).toBe(false);   // INMUEBLE es el tipo del acto: no acota nada
    expect(cedula.condicionada).toBe(true);
    expect(cedula.hechosQueDecide).toContain(FACT_TIPO_OBJETO);
  });

  it('sin tipo de objeto conocido, la regla acotada queda EN DUDA y pregunta el tipo', async () => {
    const reglas = [
      regla({ codigo: 'NOTA', objetos: [{ objetoTipoCodigo: 'INMUEBLE' }] }),
      regla({ codigo: 'CEDULA', objetos: [{ objetoTipoCodigo: 'VIVIENDA' }] }),
    ];
    const r = await resolverRequisitos(repo({ ...BASE, reglas }), '0501', {});
    expect(r.condicionados.map((x) => x.codigo)).toEqual(['CEDULA']);
    expect(r.preguntas.map((p) => p.fact)).toEqual([FACT_TIPO_OBJETO]);
    expect(r.preguntas[0].opciones).toEqual(['VIVIENDA']);
  });

  it('sin reglas no revienta: devuelve todo vacío', async () => {
    const r = await resolverRequisitos(repo(BASE), '9999', {});
    expect(r.firmes).toEqual([]);
    expect(r.condicionados).toEqual([]);
    expect(r.descartados).toEqual([]);
    expect(r.preguntas).toEqual([]);
    expect(r.diagnostico.reglasConsideradas).toBe(0);
  });
});
