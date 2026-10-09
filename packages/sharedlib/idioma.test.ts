// Detección del idioma de la respuesta de MycoBot.
//   npx tsx idioma.test.ts
import assert from 'node:assert/strict';
import { decidirIdiomaRespuesta, detectarIdioma, idiomaDePreferencia, type Idioma } from './idioma';

const casos: Array<[string, Idioma]> = [
  // Castellano
  ['¿Qué documentos necesito para una compraventa de vivienda?', 'es'],
  ['Hay que pedir el certificado de eficiencia energética en una donación de un local?', 'es'],
  ['Cómo se liquida el impuesto de sucesiones en Andalucía', 'es'],
  ['tengo una herencia con un usufructo vitalicio del cónyuge', 'es'],
  // Catalán
  ['Quins documents necessito per a una compravenda d\'habitatge?', 'ca'],
  ['Cal demanar el certificat d\'eficiència energètica en una donació?', 'ca'],
  ['Com es liquida l\'impost de successions a Catalunya', 'ca'],
  ['tinc una herència amb un usdefruit vitalici del cònjuge', 'ca'],
  ['Què passa amb la plusvàlua municipal si el venedor és no resident?', 'ca'],
  // Gallego
  ['Que documentos necesito para unha compravenda de vivenda?', 'gl'],
  ['Como se liquida o imposto de sucesións en Galicia, xa que non hai testamento?', 'gl'],
  ['Que documentos necesito para unha doazón dunha vivenda? Resposta breve.', 'gl'],
  ['Cal é o prazo para presentar o imposto?', 'gl'],
  ['Teño que levar o DNI orixinal á notaría?', 'gl'],
  // Euskera
  ['Zer dokumentu behar ditut etxebizitza baten salerosketa egiteko?', 'eu'],
  ['Nola egiten da jaraunspenaren eskritura notarioaren aurrean?', 'eu'],
  // Inglés y portugués
  ['What documents do I need for the sale of a flat in Spain?', 'en'],
  ['Quais documentos são necessários para a compra de uma casa?', 'pt'],
  // Frases cortas casi iguales en castellano y catalán (donde más falla un detector).
  ['Es necesario el certificado?', 'es'],
  ['És necessari el certificat?', 'ca'],
  ['Puedo firmar mañana?', 'es'],
  ['Puc signar demà?', 'ca'],
  ['Y el IBI quién lo paga?', 'es'],
  ['I l\'IBI qui el paga?', 'ca'],
  ['resume la respuesta', 'es'],
  ['resumeix la resposta', 'ca'],
  ['más breve', 'es'],
  ['més breu', 'ca'],
  ['tradúcelo al inglés', 'es'],
  ['Necesito el modelo 600', 'es'],
  ['Necessito el model 600', 'ca'],
  ['vale, gracias', 'es'],
  ['d\'acord, gràcies', 'ca'],
  ['Hola, bon dia', 'ca'],
  ['Buenos días', 'es'],
];

let fallos = 0;
for (const [texto, esperado] of casos) {
  const d = detectarIdioma(texto);
  if (d.idioma !== esperado) {
    fallos++;
    console.error(`✗ «${texto}» → ${d.idioma} (esperado ${esperado})`, d.puntos);
  }
}

// Mensajes cortos: no se dan por seguros…
for (const corto of ['ok', 'gracias', 'i a Catalunya?', '1234/2025', 'sí']) {
  const d = detectarIdioma(corto);
  if (d.idioma && corto !== 'gracias') {
    // «gracias» puede salir 'es' con seguridad; el resto no debe
    console.warn(`· «${corto}» detectado como ${d.idioma} (aceptable si es correcto)`);
  }
}

// …y entonces manda la conversación.
// Una palabra suelta en una conversación en castellano no la pasa a catalán (8-oct-2026).
assert.equal(
  decidirIdiomaRespuesta({ pregunta: 'La primera', anteriores: ['declaración de obra nueva por antigüedad'] }),
  'es',
);
assert.equal(decidirIdiomaRespuesta({ pregunta: 'la segona', anteriores: ['Quina escriptura necessito per a una obra nova?'] }), 'ca');
// …pero un cambio de idioma claro sí cuenta, aunque sea corto.
assert.equal(decidirIdiomaRespuesta({ pregunta: 'més breu', anteriores: ['¿Qué documentos necesito para una compraventa?'] }), 'ca');
assert.equal(
  decidirIdiomaRespuesta({
    pregunta: 'i a Catalunya?',
    anteriores: ['Quins documents necessito per a una compravenda d\'habitatge?'],
  }),
  'ca',
);
assert.equal(
  decidirIdiomaRespuesta({
    pregunta: 'ok',
    anteriores: ['¿Qué documentos necesito para una compraventa de vivienda?'],
  }),
  'es',
);
// Primer turno corto: el idioma preferido (interfaz o Telegram).
assert.equal(decidirIdiomaRespuesta({ pregunta: 'ok', preferido: 'CAT' }), 'ca');
assert.equal(decidirIdiomaRespuesta({ pregunta: 'ok', preferido: 'gl-ES' }), 'gl');
assert.equal(decidirIdiomaRespuesta({ pregunta: 'ok' }), 'es');
// La pregunta manda sobre la conversación y sobre la preferencia.
assert.equal(
  decidirIdiomaRespuesta({
    pregunta: '¿Y qué pasa si el vendedor no es residente?',
    anteriores: ['Quins documents necessito per a una compravenda?'],
    preferido: 'CAT',
  }),
  'es',
);

assert.equal(idiomaDePreferencia('CAST'), 'es');
assert.equal(idiomaDePreferencia('ca'), 'ca');
assert.equal(idiomaDePreferencia('EUS'), 'eu');
assert.equal(idiomaDePreferencia('fr'), null);

if (fallos) {
  console.error(`\n${fallos} de ${casos.length} frases mal detectadas`);
  process.exit(1);
}
console.log(`✓ ${casos.length} frases bien detectadas; reglas de conversación y preferencia OK`);
