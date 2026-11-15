// LO QUE SÓLO DEPENDE DEL TEXTO, CALCULADO UNA VEZ (15-nov-2026).
//
// Redactor recalcula los campos de una tarea con cada respuesta, siempre sobre el MISMO esquema expandido (~3 MB), y
// cinco funciones puras del texto —`constantesFijas`, `extractDeclareFixedValues`, `listasDeLaPlantilla`,
// `marcarListasParaSonda` y `valoresDeSchema`— se repetían en cada vuelta, varias veces por respuesta. Medido en 133
// tareas reales: el 26 % del cálculo. Guardar su resultado no cambia nada de lo que devuelven (mismo patrón que
// `PREPARADOS` de `resolverDeclarados`).
//
// Una sola caché para todas, por texto: así cada texto se retiene UNA vez aunque lo usen las cinco. Pocos textos (son
// grandes) y sólo los grandes: con un párrafo suelto calcular es más barato que guardar. Quien la usa devuelve una
// COPIA de lo guardado cuando es mutable (objeto, Map, Set): quien llama puede modificar lo que recibe sin estropear la
// respuesta siguiente.

const MAX_TEXTOS = 4;
const MIN_LARGO = 20_000;

const TEXTOS = new Map<string, Map<string, unknown>>();

/** `calcular(texto)` guardado bajo `nombre` para ese texto. El resultado guardado no se entrega nunca: sí `copia(r)`. */
export function memoPorTexto<T>(nombre: string, texto: string, calcular: (t: string) => T, copia: (r: T) => T): T {
  if (texto.length < MIN_LARGO) return calcular(texto);
  let porFuncion = TEXTOS.get(texto);
  if (porFuncion) {
    // El más reciente al final: se descarta el que lleva más tiempo sin usarse.
    TEXTOS.delete(texto);
    TEXTOS.set(texto, porFuncion);
  } else {
    porFuncion = new Map();
    if (TEXTOS.size >= MAX_TEXTOS) TEXTOS.delete(TEXTOS.keys().next().value!);
    TEXTOS.set(texto, porFuncion);
  }
  if (!porFuncion.has(nombre)) porFuncion.set(nombre, calcular(texto));
  return copia(porFuncion.get(nombre) as T);
}

/** Para los tests: vacía la caché. */
export function olvidarMemoPorTexto(): void {
  TEXTOS.clear();
}

export const sinCopia = <T>(r: T): T => r;
export const copiaObjeto = <T extends object>(r: T): T => ({ ...r });
export const copiaSet = <T>(r: Set<T>): Set<T> => new Set(r);
