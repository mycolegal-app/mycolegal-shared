// `npx tsx --test nul.test.ts`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinNul } from './index';

test('el texto sale sin NUL y con los caracteres recontados (PostgreSQL no admite NUL)', () => {
  const r = sinNul({ texto: 'Certificado\u0000 de la\u0000 comunidad', chars: 25, metodo: 'pdf-text-layer' });
  assert.equal(r.texto, 'Certificado de la comunidad');
  assert.equal(r.chars, 'Certificadodelacomunidad'.length);
});
