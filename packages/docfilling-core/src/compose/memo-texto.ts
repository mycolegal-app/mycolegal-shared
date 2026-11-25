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

// 25-nov-2026 (Rendimiento; OOM del principal de Redactor LOCAL con techo de 752 MB): la caché se limita por BYTES, no por
// número de textos. Con esquemas expandidos de 7-13 MB (2 bytes por carácter en cuanto hay un «…» o un «€»), cuatro
// textos eran ya 100 MB. La clave sigue siendo el texto: probada una huella (FNV-1a + djb2), calcularla sobre 8,6 MB
// costaba 17 ms por llamada frente a 2,7 ms de buscar el texto en el Map; con el tope, lo que retiene el texto ya cuenta.
const MAX_BYTES = 80 * 1024 * 1024;
const MIN_LARGO = 20_000;

const TEXTOS = new Map<string, { porFuncion: Map<string, unknown>; bytes: number }>();
let bytesTotal = 0;

/** Lo que ocupa un texto con lo calculado para él, estimado por lo alto: el doble del propio texto (2 bytes/carácter,
 *  y lo calculado —listas, marcas— no suele pasar de otro tanto). */
const bytesDe = (texto: string) => texto.length * 4;

/** `calcular(texto)` guardado bajo `nombre` para ese texto. El resultado guardado no se entrega nunca: sí `copia(r)`. */
export function memoPorTexto<T>(nombre: string, texto: string, calcular: (t: string) => T, copia: (r: T) => T): T {
  if (texto.length < MIN_LARGO) return calcular(texto);
  const k = texto;
  let e = TEXTOS.get(k);
  if (e) {
    // El más reciente al final: se descarta el que lleva más tiempo sin usarse.
    TEXTOS.delete(k);
    TEXTOS.set(k, e);
  } else {
    e = { porFuncion: new Map(), bytes: bytesDe(texto) };
    // Fuera los más viejos hasta que quepa; siempre se queda al menos el de ahora.
    while (TEXTOS.size && bytesTotal + e.bytes > MAX_BYTES) {
      const [viejo, v] = TEXTOS.entries().next().value!;
      TEXTOS.delete(viejo);
      bytesTotal -= v.bytes;
    }
    TEXTOS.set(k, e);
    bytesTotal += e.bytes;
  }
  if (!e.porFuncion.has(nombre)) e.porFuncion.set(nombre, calcular(texto));
  return copia(e.porFuncion.get(nombre) as T);
}

/** Para los tests: vacía la caché. */
export function olvidarMemoPorTexto(): void {
  TEXTOS.clear();
  bytesTotal = 0;
}

/** Para los tests y las mediciones: cuántos textos y cuántos bytes estimados guarda. */
export function estadoMemoPorTexto(): { textos: number; bytes: number } {
  return { textos: TEXTOS.size, bytes: bytesTotal };
}

export const sinCopia = <T>(r: T): T => r;
export const copiaObjeto = <T extends object>(r: T): T => ({ ...r });
export const copiaSet = <T>(r: Set<T>): Set<T> => new Set(r);
