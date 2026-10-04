// Un repositorio de mentira, para probar el motor SIN base de datos.
//
// Esto es lo que el puerto compra. La versión de Consultor sólo se puede probar
// con un `PrismaClient` real contra el golden cargado —su `motor.test.ts` son 378
// líneas de integración con `console.log`—, así que una regla nueva no se podía
// probar sin sembrar la base. Aquí se escriben las filas a mano.
import type { ReglaGolden, NodoTipo, RepositorioRequisitos } from '../src/puerto';

/** Una regla con todo a su valor neutro: los tests sólo escriben lo que importa. */
export function regla(p: Partial<ReglaGolden> & { codigo: string }): ReglaGolden {
  return {
    id: `id-${p.codigo}`,
    descripcion: null,
    tipo: 'OBLIGATORIO',
    momento: 'ANTES_FIRMA',
    scopeGeneracion: 'UNICO',
    ccaaCodigo: '',
    documentoCodigo: p.codigo,
    estado: 'REVISADO',
    revisadoPor: 'notario',
    tratamientoInstrumento: 'NINGUNO',
    sustituye: null,
    modificaCodigo: null,
    actoCodigo: '0501',
    condiciones: [],
    roles: [],
    objetos: [],
    obtencion: null,
    fundamentos: [],
    evidenciaGrupo: null,
    ...p,
  };
}

/** Una condición sobre un hecho, con su atributo ya montado. */
export function cond(
  ambito: string, codigo: string, operador: string, valor: unknown,
  extra: { grupo?: number; scopeRolCodigo?: string | null; tipoDato?: string } = {},
): ReglaGolden['condiciones'][number] {
  return {
    atributoDef: {
      ambito, codigo, label: `${ambito}.${codigo}`,
      tipoDato: extra.tipoDato ?? 'BOOLEANO', opciones: null, fuentePreferente: null,
    },
    operador, valor,
    grupo: extra.grupo ?? 0,
    scopeRolCodigo: extra.scopeRolCodigo ?? null,
  };
}

export function repo(opciones: {
  reglas?: ReglaGolden[];
  tiposObjeto?: NodoTipo[];
  tiposSujeto?: NodoTipo[];
  conGolden?: string[];
  /** Para comprobar con qué se llamó al puerto. */
  espia?: (args: unknown) => void;
} = {}): RepositorioRequisitos {
  return {
    async reglasDeActo(args) { opciones.espia?.(args); return opciones.reglas ?? []; },
    async tiposDeObjeto() { return opciones.tiposObjeto ?? []; },
    async tiposDeSujeto() { return opciones.tiposSujeto ?? []; },
    async actosConGolden(actos) {
      return new Set(actos.filter((a) => (opciones.conGolden ?? []).includes(a)));
    },
  };
}

/** La jerarquía is-a que el motor necesita para que VIVIENDA cumpla INMUEBLE. */
export const TIPOS_OBJETO: NodoTipo[] = [
  { codigo: 'OBJETO', parentCodigo: null },
  { codigo: 'INMUEBLE', parentCodigo: 'OBJETO' },
  { codigo: 'URBANO', parentCodigo: 'INMUEBLE' },
  { codigo: 'VIVIENDA', parentCodigo: 'URBANO' },
  { codigo: 'RUSTICA', parentCodigo: 'INMUEBLE' },
];
export const TIPOS_SUJETO: NodoTipo[] = [
  { codigo: 'SUJETO', parentCodigo: null },
  { codigo: 'PF', parentCodigo: 'SUJETO' },
  { codigo: 'PJ', parentCodigo: 'SUJETO' },
];
