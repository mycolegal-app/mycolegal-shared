/**
 * #873 — ¿Está bien formado un NIF/NIE español y cuadra su control?
 *
 * Comprueba FORMA y DÍGITO/LETRA DE CONTROL: DNI (8 cifras + letra), NIE
 * (X/Y/Z + 7 cifras + letra), NIF especial de persona física (K/L/M + 7 cifras
 * + letra) y NIF de persona jurídica (letra + 7 cifras + control). NO dice si el
 * NIF existe ni de quién es: eso solo lo sabe la Agencia Tributaria.
 */
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CONTROL_CIF = 'JABCDEFGHI';

/** Quita espacios, guiones y puntos y pasa a mayúsculas. */
export function normalizarNif(nif: string): string {
  return nif.replace(/[\s.\-]/g, '').toUpperCase();
}

export function esNifValido(entrada: string): boolean {
  const n = normalizarNif(entrada);
  // DNI
  let m = /^(\d{8})([A-Z])$/.exec(n);
  if (m) return LETRAS_DNI[Number(m[1]) % 23] === m[2];
  // NIE
  m = /^([XYZ])(\d{7})([A-Z])$/.exec(n);
  if (m) return LETRAS_DNI[Number(`${'XYZ'.indexOf(m[1])}${m[2]}`) % 23] === m[3];
  // NIF especiales de persona física (K, L, M): control como el DNI sobre las 7 cifras.
  m = /^([KLM])(\d{7})([A-Z])$/.exec(n);
  if (m) return LETRAS_DNI[Number(m[2]) % 23] === m[3];
  // Persona jurídica / entidad: letra + 7 cifras + control (cifra o letra).
  m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(n);
  if (m) {
    const d = m[2].split('').map(Number);
    let suma = 0;
    d.forEach((x, i) => {
      if (i % 2 === 1) suma += x; // posiciones pares (2ª, 4ª, 6ª)
      else {
        const doble = x * 2;
        suma += Math.floor(doble / 10) + (doble % 10);
      }
    });
    const control = (10 - (suma % 10)) % 10;
    return m[3] === String(control) || m[3] === CONTROL_CIF[control];
  }
  return false;
}
