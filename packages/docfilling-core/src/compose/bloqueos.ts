/**
 * `{{BLOQUEO: texto}}` — lo que impide dar la escritura por buena (12-nov-2026, Carles; dictamen P30 de Javier).
 *
 * Va dentro de un IF: «si la huella de la edificación se sale del suelo real, no se puede firmar». No se imprime
 * nunca. La composición devuelve los bloqueos VIVOS —los de las ramas que el caso recorre— y quien compone (Redactor)
 * no da la tarea por terminada ni deja descargarla mientras haya alguno. INFRANQUEABLE: no hay forma de forzarlo; se
 * resuelve cambiando el dato que lo abre (un certificado rectificado, una geometría subsanada).
 *
 * Qué rama está viva lo dice la propia composición, como las ramas recorridas de la cobertura: cada BLOQUEO se cambia
 * por una marca antes de resolver IF y FOR EACH, y las marcas que sobreviven son los vivos. Así no hay que reevaluar
 * condiciones por otro camino que pudiera no coincidir con el del motor.
 */

/** `{{BLOQUEO: texto}}`; el texto es lo que se le dice al oficial. */
export const RE_BLOQUEO = /\{\{\s*BLOQUEO\s*:\s*([^}]*?)\s*\}\}/gi;
const MARCA = (i: number) => `\x00BLQ:${i}\x00`;
const RE_MARCA = /\x00BLQ:(\d+)\x00/g;

/** Los bloqueos que declara un texto, vivos o no, en orden y sin repetir. */
export function bloqueosDeclarados(texto: string): string[] {
  return [...new Set([...texto.matchAll(RE_BLOQUEO)].map((m) => m[1].trim()).filter(Boolean))];
}

/** Cambia cada `{{BLOQUEO: …}}` por una marca; devuelve el texto y los textos de los bloqueos, por índice. */
export function marcarBloqueos(texto: string): { texto: string; textos: string[] } {
  const textos: string[] = [];
  const marcado = texto.replace(RE_BLOQUEO, (_, t: string) => {
    textos.push(t.trim());
    return MARCA(textos.length - 1);
  });
  return { texto: marcado, textos };
}

/** Los bloqueos cuya marca sobrevivió a la composición, en orden y sin repetir (un FOR EACH puede repetirlos). */
export function bloqueosVivos(compuesto: string, textos: readonly string[]): string[] {
  const vivos: string[] = [];
  for (const m of compuesto.matchAll(RE_MARCA)) {
    const t = textos[Number(m[1])];
    if (t && !vivos.includes(t)) vivos.push(t);
  }
  return vivos;
}

/**
 * El texto sin las marcas, igual que si su IF no se hubiera cumplido: un IF vivo deja su cuerpo como párrafo propio
 * (`obra.\n\n<bloqueo>\n\nFin.`), así que el párrafo que sólo era el bloqueo se va con la línea en blanco que lo
 * separa; la línea que sólo era el bloqueo, con su salto; y la marca en mitad de un texto, sola.
 */
export function quitarMarcasDeBloqueo(compuesto: string): string {
  const SOLO = '[ \\t]*(?:\\x00BLQ:\\d+\\x00[ \\t]*)+';
  return compuesto
    .replace(new RegExp(`(^|\\n\\n)${SOLO}(?:\\n\\n|$)`, 'g'), '$1')
    .replace(new RegExp(`(^|\\n)${SOLO}(?:\\n|$)`, 'g'), '$1')
    .replace(RE_MARCA, '');
}
