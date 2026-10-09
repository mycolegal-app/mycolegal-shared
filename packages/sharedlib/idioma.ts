// Idioma de la respuesta de los asistentes de MycoLegal (F8 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md).
//
// FUENTE ÚNICA desde sharedlib 0.12.21. Antes estaba copiado en consultor, redactor y web
// (`src/lib/idioma/detectar.ts`); las apps importan de `@mycolegal-app/sharedlib/idioma`.
// Tests: `npx tsx idioma.test.ts` en este paquete.
//
// La regla: el idioma de la pregunta; si es corta o ambigua («ok», «i a Catalunya?»), el de los
// mensajes anteriores de la conversación; si no, el preferido (interfaz o `language_code` de
// Telegram), y en último término el castellano.
//
// Detector sin IA ni dependencias: cada idioma tiene sus palabras frecuentes, y una palabra que
// comparten varios idiomas puntúa 1/N en cada uno; se suman rasgos ortográficos propios.

export type Idioma = 'es' | 'ca' | 'gl' | 'eu' | 'en' | 'pt';

const PALABRAS: Record<Idioma, string> = {
  es: `el la los las del al con para por que qué cómo cuál cuáles cuándo dónde quién una uno unos unas es está están son
    pero muy también hay puedo puede pueden tengo tiene tienen sobre este esta estos estas ese esa eso lo le les se sí no
    cuando donde porque hacer hace ser debe deben entre sin según y o ya aquí ahora más hasta desde mi mis su sus
    necesito quiero cuánto cuánta escritura notario notaría herencia compraventa hipoteca usted gracias hola
    necesario necesaria breve resume resumen respuesta modelo buenos buenas días vale firmar firma mañana inglés
    certificado vendedor comprador impuesto plusvalía poder acta`,
  ca: `el els la les del dels al als amb per que què com quin quina quins quines quan on qui un una uns unes és està
    estan són però molt també hi ha puc pot poden tinc té tenen sobre aquest aquesta aquests aquestes aquell aquella
    això ho li es se sí no perquè fer fa ser cal entre sense segons i o ja aquí ara més fins des meu meva seu seva
    necessito vull quant quanta escriptura notari notaria herència compravenda hipoteca vostè gràcies hola doncs
    necessari necessària breu resumeix resum resposta model bon bona dia d'acord signar signatura demà anglès
    certificat venedor comprador impost plusvàlua poder acta`,
  gl: `o os a as do dos da das ao aos cun cunha para por que como cal cales cando onde quen un unha uns unhas é está
    están son pero moi tamén hai podo pode poden teño ten teñen sobre este esta estes estas ese esa iso isto lle lles
    se si non porque facer fai ser debe deben entre sen segundo e ou xa aquí agora máis ata dende meu miña seu súa
    necesito quero canto canta escritura notario notaría herdanza compravenda hipoteca vostede grazas ola polo pola
    dun dunha nun nunha coa coas á ás co cos prazo imposto levar vivenda doazón orixinal deixar facer resposta
    teño tes temos podes debo hoxe mañá onte hipoteca escritura`,
  eu: `eta da du dut dute zer nola zein zeinek noiz non nork bat batzuk ez bai baina ere hau hori hura hauek horiek
    nire zure gure haren egin egiten behar dago daude izan ditu dira dugu duzu al edo ba orain hemen gehiago arte
    eskritura notarioa notaritza jaraunspena salerosketa hipoteka mesedez eskerrik kaixo zergatik nahi dut`,
  en: `the a an of and to in is are was were what how which who when where why can could should would will i my me
    you your for with on at this that these those it its be have has had do does did not no yes about from by as
    please thanks hello deed notary inheritance mortgage sale`,
  pt: `o os a as do dos da das ao aos com para por que como qual quais quando onde quem um uma uns umas é está
    estão são mas muito também há posso pode podem tenho tem têm sobre este esta estes estas esse essa isso isto lhe
    se sim não porque fazer faz ser deve devem entre sem segundo e ou já aqui agora mais até desde meu minha seu sua
    preciso quero quanto quanta escritura notário notaria herança compra venda hipoteca você obrigado olá pelo pela`,
};

// Palabra → idiomas que la usan. Cada aparición puntúa 1/N en cada uno.
const INDICE = new Map<string, Idioma[]>();
for (const [idioma, lista] of Object.entries(PALABRAS) as [Idioma, string][]) {
  for (const p of lista.split(/\s+/).filter(Boolean)) {
    const prev = INDICE.get(p) ?? [];
    if (!prev.includes(idioma)) prev.push(idioma);
    INDICE.set(p, prev);
  }
}

// Rasgos ortográficos: [patrón, idioma, puntos por aparición].
const RASGOS: Array<[RegExp, Idioma, number]> = [
  [/l·l/g, 'ca', 2],
  [/\b[ldsnm]['’][aeiouhàèéíïòóúü]/g, 'ca', 1.5], // l'escriptura, d'herència, s'ha
  [/\b\w+(?:ny|nys)\b/g, 'ca', 0.5], // any, Catalunya, companys
  [/[èò]/g, 'ca', 1.5], // també, què, demà: el castellano no usa el acento grave
  [/à/g, 'ca', 0.75],
  [/[aeiou]ss[aeiou]/g, 'ca', 0.75], // necessari, successions: el castellano no tiene «ss»
  [/\b\w+aris?\b/g, 'ca', 0.75], // necessari, notaris
  [/\b\w+(?:ario|aria|arios|arias)\b/g, 'es', 0.5],
  [/[¿¡]/g, 'es', 1.5],
  [/ñ/g, 'es', 0.4],
  [/ñ/g, 'gl', 0.4], // teño, viño: el gallego también la usa
  [/ción\b|ciones\b/g, 'es', 0.75],
  [/ção\b|ções\b|ã|õ/g, 'pt', 2],
  [/\bx[aeiou]/g, 'gl', 0.75], // xa, xente, xuízo
  [/[^\se]x[aeiou]/g, 'gl', 1], // orixinal, deixar, xestión (no «ex-»: examen, exacto)
  [/\bd?unha\b|\bnunha\b/g, 'gl', 1.5],
  [/tx|tz/g, 'eu', 1],
  [/\b\w+(?:ak|ek|ko|tik|ren|rekin|tzeko|tzen)\b/g, 'eu', 0.75],
];

export interface Deteccion {
  idioma: Idioma | null;
  /** Ventaja del primero sobre el segundo, de 0 a 1. */
  confianza: number;
  puntos: Partial<Record<Idioma, number>>;
}

/** Para dar el idioma por seguro: bastantes puntos con ventaja razonable, o pocos con ventaja muy clara. */
const MIN_PUNTOS = 1.5;
const MIN_VENTAJA = 0.35;
const MIN_PUNTOS_CORTO = 1;
const MIN_VENTAJA_CORTO = 0.7;

export function detectarIdioma(texto: string): Deteccion {
  const t = (texto || '').toLowerCase();
  const puntos: Partial<Record<Idioma, number>> = {};
  const suma = (i: Idioma, n: number) => { puntos[i] = (puntos[i] ?? 0) + n; };

  for (const palabra of t.match(/[\p{L}·']+/gu) ?? []) {
    const idiomas = INDICE.get(palabra);
    if (idiomas) for (const i of idiomas) suma(i, 1 / idiomas.length);
  }
  for (const [re, idioma, n] of RASGOS) {
    const veces = t.match(re)?.length ?? 0;
    if (veces) suma(idioma, veces * n);
  }

  const orden = (Object.entries(puntos) as [Idioma, number][]).sort((a, b) => b[1] - a[1]);
  const [primero, segundo] = orden;
  if (!primero || primero[1] < MIN_PUNTOS_CORTO) return { idioma: null, confianza: 0, puntos };
  const confianza = segundo ? (primero[1] - segundo[1]) / primero[1] : 1;
  const seguro =
    (primero[1] >= MIN_PUNTOS && confianza >= MIN_VENTAJA) ||
    (primero[1] >= MIN_PUNTOS_CORTO && confianza >= MIN_VENTAJA_CORTO);
  return { idioma: seguro ? primero[0] : null, confianza, puntos };
}

/** Idioma de la interfaz (CAST/CAT/GAL/EUS) o `language_code` de Telegram (es, ca-ES…) → Idioma. */
export function idiomaDePreferencia(valor?: string | null): Idioma | null {
  const v = (valor || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'cast' || v.startsWith('es')) return 'es';
  if (v === 'cat' || v.startsWith('ca') || v === 'val' || v.startsWith('va')) return 'ca';
  if (v === 'gal' || v.startsWith('gl')) return 'gl';
  if (v === 'eus' || v.startsWith('eu')) return 'eu';
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('pt')) return 'pt';
  return null;
}

/**
 * Lo que dice una detección, con el idioma del usuario como desempate: si el preferido queda
 * CERCA del primero (dentro de la ventaja que exige `detectarIdioma` para dar uno por seguro),
 * gana el preferido. «Es necesario el certificado?» de un usuario en catalán no es castellano
 * claro; «Quins documents necessito…?» de uno en castellano sí es catalán claro.
 */
function conPreferido(d: Deteccion, preferido: Idioma | null): Idioma | null {
  const [primero] = (Object.entries(d.puntos) as [Idioma, number][]).sort((a, b) => b[1] - a[1]);
  const suyo = preferido ? d.puntos[preferido] ?? 0 : 0;
  if (preferido && primero && suyo > 0 && suyo >= primero[1] * (1 - MIN_VENTAJA)) return preferido;
  return d.idioma;
}

/**
 * Idioma en que se contesta este mensaje. `anteriores` son las preguntas previas del usuario
 * en la conversación (las más recientes al final); `preferido`, el idioma que tiene
 * configurado (interfaz o `language_code` de Telegram), que desempata cuando los puntos están
 * cerca y decide cuando no hay nada que detectar.
 */
export function decidirIdiomaRespuesta(p: {
  pregunta: string;
  anteriores?: string[];
  preferido?: string | null;
}): Idioma {
  const preferido = idiomaDePreferencia(p.preferido);
  const propia = detectarIdioma(p.pregunta);
  const contexto = (p.anteriores ?? []).slice(-3).join('\n');
  // Con conversación detrás, un mensaje que gana por la mínima (una palabra suelta: «La
  // primera», 8-oct-2026, salía catalán en una conversación en castellano) no cambia el
  // idioma: decide la conversación. Sin conversación, vale lo que diga el mensaje.
  const maximo = Math.max(0, ...Object.values(propia.puntos));
  if (!contexto.trim() || maximo >= MIN_PUNTOS) {
    const i = conPreferido(propia, preferido);
    if (i) return i;
  }

  if (contexto.trim()) {
    const conv = conPreferido(detectarIdioma(`${contexto}\n${p.pregunta}`), preferido);
    if (conv) return conv;
  }
  return preferido ?? 'es';
}

const NOMBRE: Record<Idioma, string> = {
  es: 'castellano',
  ca: 'catalán',
  gl: 'gallego',
  eu: 'euskera',
  en: 'inglés',
  pt: 'portugués',
};

/**
 * Instrucción que se AÑADE AL FINAL del system prompt. Va al final, y dice que prevalece,
 * porque los prompts del catálogo se pueden editar en Admin y una versión antigua puede
 * seguir diciendo «Responde en español».
 */
export function directrizIdioma(idioma: Idioma, excepcionPropia?: string): string {
  return [
    'IDIOMA DE LA RESPUESTA — esta instrucción PREVALECE sobre cualquier otra indicación de idioma anterior:',
    `redacta toda la respuesta en ${NOMBRE[idioma]}, que es el idioma en que te escribe el usuario.`,
    'Excepciones: (1) si en este turno el usuario pide expresamente otro idioma (por ejemplo, «tradúcelo al',
    'inglés»), obedécele; (2) las citas literales de resoluciones, sentencias o normas se reproducen en su',
    'idioma original, sin traducirlas, y los nombres oficiales de leyes y organismos no se traducen.',
    ...(excepcionPropia ? [excepcionPropia] : []),
  ].join('\n');
}
