import { describe, it, expect } from 'vitest';
import { vertexUsage } from './vertex';

describe('tokens de una respuesta de Vertex', () => {
  it('los tokens de razonamiento cuentan como salida (se facturan así)', () => {
    expect(vertexUsage({ usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 1800 } }))
      .toEqual({ tokensIn: 1000, tokensOut: 2000 });
  });
  it('sin razonamiento, como siempre; Claude y embeddings igual que antes', () => {
    expect(vertexUsage({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } })).toEqual({ tokensIn: 10, tokensOut: 5 });
    expect(vertexUsage({ usage: { input_tokens: 7, output_tokens: 3 } })).toEqual({ tokensIn: 7, tokensOut: 3 });
    expect(vertexUsage({ predictions: [] })).toEqual({ tokensIn: 0, tokensOut: 0 });
  });
});
