import { describe, it, expect } from 'vitest';
import { createModelEndpointResolver, ModeloFueraDeUeError, esUbicacionUe } from './model-endpoint';
import { vertexHost, vertexLocationFor } from '../vertex';

const catalogo = (filas: Record<string, { host: string; location: string; provider: string; verb: string; available: boolean }>) => ({
  aiModel: { async findUnique({ where }: { where: { modelId: string } }) { return filas[where.modelId] ?? null; } },
});

describe('residencia UE de la IA (26-nov-2026)', () => {
  it('un gemini-3 que no está en el catálogo va a la multi-región eu, no a global', async () => {
    const r = createModelEndpointResolver({ prisma: catalogo({}) });
    expect(await r.endpointDeModelo('gemini-3.8-flash')).toMatchObject({ host: 'aiplatform.eu.rep.googleapis.com', location: 'eu' });
  });
  it('un modelo del catálogo que sólo existe en global no se usa: error claro', async () => {
    const r = createModelEndpointResolver({ prisma: catalogo({ 'gemini-3.1-pro-preview': { host: 'aiplatform.googleapis.com', location: 'global', provider: 'google', verb: 'generateContent', available: true } }) });
    await expect(r.endpointDeModelo('gemini-3.1-pro-preview')).rejects.toBeInstanceOf(ModeloFueraDeUeError);
  });
  it('europe-west4 y eu son UE; global y us no', () => {
    expect(['eu', 'europe-west4', 'europe-west1'].every(esUbicacionUe)).toBe(true);
    expect(['global', 'us', 'us-central1'].some(esUbicacionUe)).toBe(false);
  });
  it('vertex.ts: gemini-3 a eu, host de la multi-región, y global rechazado', () => {
    expect(vertexLocationFor('gemini-3.5-flash', 'europe-west4')).toBe('eu');
    expect(vertexHost('eu')).toBe('aiplatform.eu.rep.googleapis.com');
    expect(vertexHost('europe-west4')).toBe('europe-west4-aiplatform.googleapis.com');
    expect(() => vertexHost('global')).toThrow();
  });
});
