import { describe, it, expect } from 'vitest';
import { copiaAltaInicial, conModo, primerErrorCopiaAlta, copiaAltaPayload, type CopiaAltaValues } from './copia-alta';

// Un alta válida en el Portal antes de #872, para comprobar regla a regla.
const valida = (): CopiaAltaValues => ({
  ...copiaAltaInicial(),
  notarioAutorizante: 'NOTARIO X',
  entidadOrigen: 'Otra',
  referenciaPropia: 'REF-1',
  protocoloAsiento: '1234',
});
const ctx = { refsEntidadVisibles: true, numAdjuntos: 1 };

describe('#872 — reglas del alta de copia (mismas que el Portal)', () => {
  it('un alta completa pasa', () => {
    expect(primerErrorCopiaAlta(valida(), ctx)).toBeNull();
  });
  it('en el mismo orden en que avisaba el Portal', () => {
    expect(primerErrorCopiaAlta(copiaAltaInicial(), ctx)).toBe('copiaCustodio.notarioRequerido');
    expect(primerErrorCopiaAlta({ ...valida(), entidadOrigen: '' }, ctx)).toBe('copiaCustodio.entidadOrigenRequerida');
    expect(primerErrorCopiaAlta({ ...valida(), protocoloAsiento: '', titularOriginal: '' }, ctx)).toBe('copiaCustodio.titularRequerido');
  });
  it('#835 — sin referencias de la entidad a la vista, solo vale la referencia propia', () => {
    const sinRef = { ...valida(), referenciaPropia: '', sedasExpediente: 'EXP' };
    expect(primerErrorCopiaAlta(sinRef, ctx)).toBeNull();
    expect(primerErrorCopiaAlta(sinRef, { ...ctx, refsEntidadVisibles: false })).toBe('copiaCustodio.referenciaPropiaRequerida');
    expect(primerErrorCopiaAlta({ ...sinRef, sedasExpediente: '' }, ctx)).toBe('copiaCustodio.referenciaRequerida');
  });
  it('#7 — nota simple obligatoria en escritura, no en póliza; null = la pantalla no gestiona adjuntos', () => {
    expect(primerErrorCopiaAlta(valida(), { ...ctx, numAdjuntos: 0 })).toBe('copiaCustodio.adjuntoRequerido');
    expect(primerErrorCopiaAlta(conModo(valida(), 'TESTIMONIO_POLIZA'), { ...ctx, numAdjuntos: 0 })).toBeNull();
    expect(primerErrorCopiaAlta(valida(), { ...ctx, numAdjuntos: null })).toBeNull();
  });
  it('#840 — la parcial exige su contenido', () => {
    const parcial = { ...valida(), tipoCopia: 'AUTENTICA_PARCIAL_EJECUTIVA' };
    expect(primerErrorCopiaAlta(parcial, ctx)).toBe('copiaCustodio.parteParcialRequerida');
    expect(primerErrorCopiaAlta({ ...parcial, parteParcial: 'finca 3' }, ctx)).toBeNull();
  });
});

describe('#873 — NIF/NIE del titular', () => {
  it('vacío no se exige; mal formado bloquea', () => {
    expect(primerErrorCopiaAlta({ ...valida(), titularOriginalNif: '' }, ctx)).toBeNull();
    expect(primerErrorCopiaAlta({ ...valida(), titularOriginalNif: '12345678Z' }, ctx)).toBeNull();
    expect(primerErrorCopiaAlta({ ...valida(), titularOriginalNif: '12345678A' }, ctx)).toBe('copiaCustodio.titularNifInvalido');
  });
});

describe('#872 — forma del envío (idéntica a la del Portal)', () => {
  it('referencias de la entidad ocultas = nulas aunque se tecleara algo', () => {
    const v = { ...valida(), sedasOficina: '0081', gcr: 'G1' };
    expect(copiaAltaPayload(v, { refsEntidadVisibles: false })).toMatchObject({ sedasOficina: null, gcr: null });
    expect(copiaAltaPayload(v, { refsEntidadVisibles: true })).toMatchObject({ sedasOficina: '0081', gcr: 'G1' });
  });
  it('parteParcial solo viaja en las parciales; vacíos como null', () => {
    const p = copiaAltaPayload({ ...valida(), parteParcial: 'x', concepto: '  ' }, { refsEntidadVisibles: true });
    expect(p.parteParcial).toBeNull();
    expect(p.concepto).toBeNull();
    expect(p).toMatchObject({ tipoDocumento: 'ESCRITURA', tipoCopia: 'AUTENTICA_COMPLETA_EJECUTIVA', notarioAutorizante: 'NOTARIO X' });
  });
  it('CEE: el tipoCopia queda fijo', () => {
    expect(conModo(valida(), 'CEE')).toMatchObject({ tipoDocumento: 'ESCRITURA', tipoCopia: 'TITULO_EJECUTIVO_EUROPEO' });
  });
});
