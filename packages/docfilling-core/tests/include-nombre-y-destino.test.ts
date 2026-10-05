// LAS DOS TRAMPAS DEL INCLUDE, FIJADAS CON UN TEST.
//
// Las dos costaron caro en la biblioteca real (5-oct-2026): 14 esquemas de obra
// nueva no se podían generar porque `{{INCLUDE VAR_TERMINADA_28-1}}` se leía
// como `VAR_TERMINADA_28`, y 61 de 105 esquemas tenían alguna inclusión que no
// resolvía sin que el editor dijese nada.
import { test, expect } from 'vitest';
import { validateText } from '../src/syntax/validator';

const codigos = (t: string, resolver?: any) =>
  validateText(t, resolver).diagnostics.map((d) => d.code);

test('E031: el guion corta el nombre y se avisa, con su arreglo', () => {
  const r = validateText('{{INCLUDE VAR_TERMINADA_28-1}}');
  const d = r.diagnostics.find((x) => x.code === 'E031')!;
  expect(d).toBeDefined();
  expect(d.severity).toBe('error');
  expect(d.message).toContain('VAR_TERMINADA_28-1');
  expect(d.fix?.replacement).toBe('{{INCLUDE VAR_TERMINADA_28_1}}');
});

test('E031: el `.md` al final también corta', () => {
  const d = validateText('{{INCLUDE VAR_OBRA_NUEVA.md}}').diagnostics.find((x) => x.code === 'E031')!;
  expect(d).toBeDefined();
  expect(d.fix?.replacement).toBe('{{INCLUDE VAR_OBRA_NUEVA}}');
});

test('E031: un nombre correcto NO avisa', () => {
  expect(codigos('{{INCLUDE PARR_NORMAL}}')).not.toContain('E031');
  expect(codigos('{{INCLUDE PARR_NORMAL FIELDS:_SFX}}')).not.toContain('E031');
});

test('E030: sin resolver NO se opina; con resolver, se dice qué falta', () => {
  // Sin biblioteca delante no hay forma de saberlo, y un falso positivo en el
  // editor enseña a ignorar los avisos.
  expect(codigos('{{INCLUDE PARR_QUE_NO_EXISTE}}')).not.toContain('E030');

  const resolver = (n: string) => (n === 'PARR_QUE_SI' ? { content: 'texto' } : null);
  expect(codigos('{{INCLUDE PARR_QUE_SI}}', resolver)).not.toContain('E030');
  const d = validateText('{{INCLUDE PARR_QUE_NO_EXISTE}}', resolver)
    .diagnostics.find((x) => x.code === 'E030')!;
  expect(d).toBeDefined();
  expect(d.message).toContain('PARR_QUE_NO_EXISTE');
  expect(d.message).toContain('desaparecerá');
});
