// Plantillas de documento con DocFilling (LegiFirma, Pólizas).
//   npx tsx document-docfilling.test.ts
import {
  notariosFirmantes,
  notarioFirmanteUnico,
  esNotarioFirmanteDeOrg,
  esCorreoNotarialOficial,
} from './server/notarios-firmantes';
import assert from 'node:assert/strict';
import {
  componerPlantilla,
  datosNotaria,
  datosNotariaQueFaltan,
  validarPlantillaDocumento,
  textoPlano,
  territorioDeColegio,
  municipioDe,
  estilosUsados,
  cartaGenerica,
  type CampoPlantilla,
  type DatosNotaria,
  type DbSql,
} from './document-docfilling';

const campos: CampoPlantilla[] = [
  { key: 'TIPO_DOC', label: 'Tipo', example: 'ESCRITURA', tipo: 'control', valores: ['ESCRITURA', 'POLIZA'] },
  { key: 'SOLICITANTE', label: 'Solicitante', example: 'ANA' },
  { key: 'IMPORTE', label: 'Importe', example: '50' },
  { key: 'FECHA', label: 'Fecha', example: '2026-11-27' },
  {
    key: 'COMPARECIENTES', label: 'Comparecientes', example: '', tipo: 'lista',
    subcampos: [{ key: 'NOMBRE', label: 'Nombre', example: 'X' }, { key: 'DNI', label: 'DNI', example: '1' }],
  },
];

const notaria: DatosNotaria = {
  valores: {
    NOMBRE_NOTARIA: 'Notaría Ejemplo', DIRECCION_NOTARIA: 'C/ Mayor, 1', LOCALIDAD_NOTARIA: '28001 Madrid',
    MUNICIPIO_NOTARIA: 'Madrid', TELEFONO_NOTARIA: '', EMAIL_NOTARIA: '', CIF_NOTARIA: '',
    NOMBRE_NOTARIO: 'Ana Pérez', COLEGIO_NOTARIAL: 'Madrid', POBLACION_NOTARIO: 'Madrid',
  },
  notarioFirmanteId: 'ur1',
  variosFirmantes: false,
};

// --- Componer ---------------------------------------------------------------
{
  const r = componerPlantilla({
    plantilla: "He trasladado {{IF TIPO_DOC == 'POLIZA'}}el testimonio{{ELSE}}la copia{{ENDIF}}. Importe: {{IMPORTE#amount}} €. {{FECHA#date_long}}.",
    campos, valores: { TIPO_DOC: 'POLIZA', IMPORTE: '1500.5', FECHA: '2026-11-27' }, notaria,
  });
  assert.equal(r.markdown.trim(), 'He trasladado el testimonio. Importe: 1.500,50 €. 27 de noviembre de 2026.');
  assert.deepEqual(r.bloqueos, []);
}
{
  // Un campo de la app sin valor sale VACÍO (D4), no «[NO DISPONIBLE]».
  const r = componerPlantilla({ plantilla: 'A[{{SOLICITANTE}}]B', campos, valores: {}, notaria });
  assert.equal(r.markdown.trim(), 'A[]B');
}
{
  // Escape: un nombre con formato y etiquetas sale literal.
  const r = componerPlantilla({ plantilla: 'De {{SOLICITANTE}}.', campos, valores: { SOLICITANTE: '**Juan**_<b>x</b>' }, notaria });
  assert.ok(!r.markdown.includes('<b>'), r.markdown);
  assert.ok(r.markdown.includes('\\*\\*Juan\\*\\*\\_&lt;b&gt;x&lt;/b&gt;'), r.markdown);
}
{
  // El valor de control NO se escapa: si no, la comparación fallaría.
  const r = componerPlantilla({ plantilla: "{{IF TIPO_DOC == 'POLIZA_X'}}sí{{ELSE}}no{{ENDIF}}", campos: [{ key: 'TIPO_DOC', label: '', example: '', tipo: 'control' }], valores: { TIPO_DOC: 'POLIZA_X' }, notaria });
  assert.equal(r.markdown.trim(), 'sí');
}
{
  // Lista: FOR EACH con los elementos, cada uno escapado. Es lo que faltaba en la diligencia (10.1).
  const r = componerPlantilla({
    plantilla: 'Comparecen:\n\n{{FOR EACH ITEM IN COMPARECIENTES}}\n- {{ITEM.NOMBRE}} ({{ITEM.DNI}})\n{{ENDFOR}}\n\nFin.',
    campos, valores: { COMPARECIENTES: [{ NOMBRE: 'Juan_Pérez', DNI: '1Z' }, { NOMBRE: 'Eva', DNI: '2X' }] }, notaria,
  });
  assert.ok(r.markdown.includes('- Juan\\_Pérez (1Z)'), r.markdown);
  assert.ok(r.markdown.includes('- Eva (2X)'), r.markdown);
  assert.ok(!/\n{3,}/.test(r.markdown), 'sin líneas en blanco de más');
}
{
  // Datos de la notaría con SYSTEM:.
  const r = componerPlantilla({ plantilla: 'Yo, {{SYSTEM:NOMBRE_NOTARIO}}, Notario del Ilustre Colegio de {{SYSTEM:COLEGIO_NOTARIAL}}.', campos, valores: {}, notaria });
  assert.equal(r.markdown.trim(), 'Yo, Ana Pérez, Notario del Ilustre Colegio de Madrid.');
}
{
  // ABORT: se informa en bloqueos.
  const r = componerPlantilla({ plantilla: "{{IF TIPO_DOC == 'POLIZA'}}{{ABORT: no vale}}{{ENDIF}}ok", campos, valores: { TIPO_DOC: 'POLIZA' }, notaria });
  assert.deepEqual(r.bloqueos, ['no vale']);
}
{
  // WORD_STYLE pasa intacto a la fusión.
  const r = componerPlantilla({ plantilla: '{{WORD_STYLE:Texto legal}}Letra pequeña', campos, valores: {}, notaria });
  assert.ok(r.markdown.startsWith('{{WORD_STYLE:Texto legal}}'));
  assert.deepEqual(estilosUsados('{{WORD_STYLE:Texto legal}}a\n{{WORD_STYLE: Firma }}b\n{{WORD_STYLE:Texto legal}}'), ['Texto legal', 'Firma']);
}

// --- Lo que falta de la notaría ----------------------------------------------
{
  const vacia: DatosNotaria = { ...notaria, valores: { ...notaria.valores, NOMBRE_NOTARIO: '', COLEGIO_NOTARIAL: '' } };
  const f = datosNotariaQueFaltan('Yo, {{SYSTEM:NOMBRE_NOTARIO}}, de {{SYSTEM:COLEGIO_NOTARIAL}} en {{SYSTEM:MUNICIPIO_NOTARIA}}', vacia);
  assert.deepEqual(f.map((x) => x.key).sort(), ['COLEGIO_NOTARIAL', 'NOMBRE_NOTARIO']);
  assert.ok(f.find((x) => x.key === 'NOMBRE_NOTARIO')!.dondeSeRellena.includes('Config › Notarios'));
  // Lo que la plantilla no usa no cuenta (el teléfono vacío no bloquea si no sale).
  assert.deepEqual(datosNotariaQueFaltan('{{SYSTEM:NOMBRE_NOTARIA}}', notaria), []);
  const varios = datosNotariaQueFaltan('{{SYSTEM:NOMBRE_NOTARIO}}', { ...vacia, variosFirmantes: true });
  assert.ok(varios[0].dondeSeRellena.includes('varios notarios'));
}

{
  // Un dato por el que se pregunta en un IF es opcional: el teléfono vacío oculta su línea y NO bloquea.
  const sinTel: DatosNotaria = { ...notaria, valores: { ...notaria.valores, TELEFONO_NOTARIA: '' } };
  const t = '{{SYSTEM:NOMBRE_NOTARIA}}\n\n{{IF SYSTEM:TELEFONO_NOTARIA}}Tel.: {{SYSTEM:TELEFONO_NOTARIA}}{{ENDIF}}';
  assert.deepEqual(datosNotariaQueFaltan(t, sinTel), []);
  assert.equal(componerPlantilla({ plantilla: t, campos, valores: {}, notaria: sinTel }).markdown.trim(), 'Notaría Ejemplo');
  // Fuera del IF, sí bloquea.
  assert.deepEqual(datosNotariaQueFaltan('Tel.: {{SYSTEM:TELEFONO_NOTARIA}}', sinTel).map((x) => x.key), ['TELEFONO_NOTARIA']);
  // Y el validador acepta SYSTEM: en la condición, y rechaza uno inventado.
  assert.deepEqual(validarPlantillaDocumento(t, campos).filter((d) => d.severity === 'error'), []);
  assert.ok(validarPlantillaDocumento('{{IF SYSTEM:TELEFONO}}x{{ENDIF}}', campos).some((d) => d.code === 'P003'));
  // Los literales entre comillas de una comparación no son campos.
  assert.deepEqual(validarPlantillaDocumento("{{IF TIPO_DOC == 'OTRA_COSA'}}x{{ENDIF}}", campos).filter((d) => d.severity === 'error'), []);
}

// --- Validar ------------------------------------------------------------------
{
  const ok = validarPlantillaDocumento(
    "{{SYSTEM:NOMBRE_NOTARIA}}\n\nDe {{SOLICITANTE}}: {{IMPORTE#amount}}.\n\n{{IF TIPO_DOC == 'POLIZA'}}a{{ELSE}}b{{ENDIF}}\n\n{{FOR EACH ITEM IN COMPARECIENTES}}\n- {{ITEM.NOMBRE}}\n{{ENDFOR}}\n\n{{WORD_STYLE:Texto legal}}Protección de datos.",
    campos,
  );
  assert.deepEqual(ok.filter((d) => d.severity === 'error'), [], JSON.stringify(ok));
  assert.ok(!ok.some((d) => d.code === 'W056' || d.code === 'W071'), 'W056/W071 filtrados');
}
{
  const d = validarPlantillaDocumento('De {{SOLICITANT}} y {{SYSTEM:NOMBRE_NOTARIOS}}.', campos);
  const m = d.map((x) => x.message).join(' | ');
  assert.ok(m.includes('¿Quisiste decir SOLICITANTE?'), m);
  assert.ok(m.includes('¿Quisiste decir SYSTEM:NOMBRE_NOTARIO?'), m);
}
{
  const d = validarPlantillaDocumento('{{INCLUDE PARR_X}} {{DECLARE X = 1}}', campos);
  assert.equal(d.filter((x) => x.code === 'P001').length, 2, JSON.stringify(d));
}
{
  const d = validarPlantillaDocumento('{{FOR EACH ITEM IN COMPARECIENTES}}{{ITEM.NOMBRES}}{{ENDFOR}} {{NOMBRE_NOTARIO}}', campos);
  const m = d.map((x) => x.message).join(' | ');
  assert.ok(m.includes('ITEM.NOMBRE'), m);
  assert.ok(m.includes('{{SYSTEM:NOMBRE_NOTARIO}}'), m);
}
{
  // IF sin cerrar: error del motor, bloquea.
  const d = validarPlantillaDocumento("{{IF TIPO_DOC == 'POLIZA'}}a", campos);
  assert.ok(d.some((x) => x.severity === 'error' && x.code === 'E010'), JSON.stringify(d));
}

// --- Datos de la notaría desde Config (BD simulada) ------------------------------
// Fila de `user_roles` tal como la devuelve SELECT_FIRMANTES (server/notarios-firmantes).
const ur = (id: string, o: Partial<{ usuario: string; email: string; marcado: boolean; esAdmin: boolean; censo: string; poblacion: string }> = {}) => ({
  id, usuario: o.usuario ?? null, email: o.email ?? '', marcado: o.marcado ?? false, esAdmin: o.esAdmin ?? false,
  censoId: o.censo ? 'n-' + id : null, censo: o.censo ?? null, poblacion: o.poblacion ?? null,
});
const dbCon = (usuarios: ReturnType<typeof ur>[], cfg: { clave: string; valor: string }[] = [], org = { name: 'X', colegio: null as string | null }): DbSql => ({
  async $queryRawUnsafe(q: string, ...v: unknown[]) {
    if (q.includes('FROM configuracion')) return cfg as never;
    if (q.includes('FROM organizations')) return [org] as never;
    if (q.includes('FROM user_roles ur')) return (q.includes('WHERE ur.id = $1') ? usuarios.filter((u) => u.id === v[0]) : usuarios) as never;
    throw new Error('consulta inesperada: ' + q);
  },
});
{
  const db = dbCon([ur('ur1', { usuario: 'Ana Pérez', marcado: true })], [
    { clave: 'org.nombre_comercial', valor: 'Notaría Ejemplo' }, { clave: 'org.direccion', valor: 'C/ Mayor, 1' },
    { clave: 'notaria_ciudad', valor: '08202 Sabadell (Barcelona)' }, { clave: 'notaria_notario_colegio', valor: 'Ilustre Colegio Notarial de Cataluña' },
  ], { name: 'org-slug', colegio: null });
  const d = await datosNotaria(db, 'org1');
  assert.equal(d.valores.NOMBRE_NOTARIA, 'Notaría Ejemplo');
  assert.equal(d.valores.MUNICIPIO_NOTARIA, 'Sabadell');
  assert.equal(d.valores.LOCALIDAD_NOTARIA, '08202 Sabadell (Barcelona)');
  assert.equal(d.valores.COLEGIO_NOTARIAL, 'Cataluña');
  assert.equal(d.valores.NOMBRE_NOTARIO, 'Ana Pérez');
  assert.equal(d.valores.POBLACION_NOTARIO, 'Sabadell');
  assert.equal(d.notarioFirmanteId, 'ur1');
}
{
  // Varios firmantes y el documento no dice cuál: sin notario, y lo dice.
  const d = await datosNotaria(dbCon([ur('a', { usuario: 'A', marcado: true }), ur('b', { usuario: 'B', marcado: true })], [], { name: 'X', colegio: 'Madrid' }), 'org1');
  assert.equal(d.valores.NOMBRE_NOTARIO, '');
  assert.equal(d.variosFirmantes, true);
  assert.equal(d.valores.NOMBRE_NOTARIA, 'X', 'sin nombre comercial, el de la organización');
  assert.equal(d.valores.COLEGIO_NOTARIAL, 'Madrid', 'sin colegio en Config, el de la organización');
}
{
  // Un usuario sin perfil (displayName = correo) no firma con su correo.
  const d = await datosNotaria(dbCon([ur('ur9', { usuario: 'zz@x.local', marcado: true })]), 'org1', { notarioFirmanteId: 'ur9' });
  assert.equal(d.valores.NOMBRE_NOTARIO, '');
}

// --- Quién firma: la regla común (server/notarios-firmantes) ----------------------
{
  // Micó: dos administradores (rol NOTARIO), uno SuperAdmin; firma el marcado.
  const db = dbCon([
    ur('sa', { usuario: 'SuperAdmin', esAdmin: true, email: 'soporte@mycolegal.app' }),
    ur('jm', { usuario: 'Javier Micó Giner', esAdmin: true, marcado: true, email: 'x@correonotarial.org' }),
  ]);
  assert.deepEqual((await notariosFirmantes(db, 'o')).map((n) => n.id), ['jm']);
}
{
  // Nadie marcado: cuenta el administrador con correo notarial oficial, con el nombre del censo.
  const db = dbCon([
    ur('of', { usuario: 'oficina@notariaejemplo.es', esAdmin: true, email: 'oficina@notariaejemplo.es' }),
    ur('nt', { usuario: 'lasensio@correonotarial.org', esAdmin: true, email: 'lasensio@correonotarial.org', censo: 'Laura Asensio García', poblacion: 'Madrid' }),
    ur('em', { usuario: 'Empleado', email: 'empleado@notariado.org' }),
  ]);
  const f = await notariosFirmantes(db, 'o');
  assert.deepEqual(f.map((n) => [n.id, n.nombre, n.poblacion, n.marcado]), [['nt', 'Laura Asensio García', 'Madrid', false]]);
  const d = await datosNotaria(db, 'o');
  assert.equal(d.valores.NOMBRE_NOTARIO, 'Laura Asensio García');
  assert.equal(d.valores.POBLACION_NOTARIO, 'Madrid');
  assert.equal(await esNotarioFirmanteDeOrg(db, 'o', 'of'), false, 'un administrador sin correo notarial no firma');
}
{
  // Nadie marcado y ningún correo notarial (p. ej. sólo SuperAdmin): no hay firmante; se pide marcarlo.
  const db = dbCon([ur('sa', { usuario: 'SuperAdmin', esAdmin: true, email: 'soporte@mycolegal.app' })]);
  assert.deepEqual(await notariosFirmantes(db, 'o'), []);
  assert.equal(await notarioFirmanteUnico(db, 'o'), null);
}
{
  assert.equal(esCorreoNotarialOficial('A@CorreoNotarial.org'), true);
  assert.equal(esCorreoNotarialOficial('a@sub.notariado.org'), true);
  assert.equal(esCorreoNotarialOficial('a@notariado.org.es'), false);
  assert.equal(esCorreoNotarialOficial(null), false);
}

// --- Utilidades -----------------------------------------------------------------
assert.equal(territorioDeColegio('COLEGIO NOTARIAL DE CATALUNYA'), 'CATALUNYA');
assert.equal(territorioDeColegio("Il·lustre Col·legi Notarial de Catalunya"), 'Catalunya');
assert.equal(municipioDe('08202 Sabadell (Barcelona)'), 'Sabadell');
assert.equal(municipioDe('Madrid'), 'Madrid');
assert.equal(textoPlano('{{WORD_STYLE:Texto legal}}**Hola** \\*x\\* &lt;y&gt;\n\n\n- uno'), 'Hola *x* <y>\n\n- uno');
assert.equal(Buffer.from(cartaGenerica().slice(0, 2)).toString(), 'PK', 'la carta genérica es un .docx (zip)');

console.log('document-docfilling: OK');
