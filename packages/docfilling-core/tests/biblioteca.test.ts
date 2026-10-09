// F1.9 / F1.9b — EL informe de la biblioteca, con los puertos en memoria.
//
// QUÉ MIDE Y POR QUÉ ESTAS COSAS
//
// Un INCLUDE que no resuelve deja un marcador visible y se nota. Los defectos
// que de verdad han costado encontrar son los que **no dejan rastro**, y son
// tres, los tres descubiertos a mano el 2-oct-2026 (§4.13 del plan):
//
//   1. **Huérfanos**: un párrafo que existe y que ningún `{{INCLUDE}}` pide.
//      Si falta el enrutador que lo agrupa, su cláusula no se emite nunca y
//      NADIE da un error. Así estaban las reducciones vascas y valencianas.
//   2. **Ficheros vacíos referenciados**: un enrutador de 0 bytes resuelve
//      perfectamente y no emite nada. 16 de los 20 enrutadores de exenciones
//      de sucesiones estaban así.
//   3. **Condiciones que nadie declara**: un párrafo con su `{{IF X}}` correcto
//      donde `X` no se declara en ningún documento alcanzable. El `IF` nunca
//      puede ser cierto. Así estaban 23 párrafos de cuatro comunidades.
//
// Esto NO es un test de aserciones sobre el contenido del Drive —que cambia—:
// es una MEDICIÓN que escribe informe, más un puñado de invariantes que ya
// hemos DECIDIDO y que sí deben seguir cumpliéndose. Se salta por defecto
// porque necesita el Drive montado.
//
//   DOCFILLING_PARRAFOS=".../_PROD/paragraphs" \
//   DOCFILLING_ESQUEMAS=<carpeta de esquemas .md, opcional> \
//   DOCFILLING_INFORME=/tmp/biblioteca.txt npx vitest run tests/biblioteca.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analizarBiblioteca, validateText, type Documento } from '../index';

const PARRAFOS = process.env.DOCFILLING_PARRAFOS;
const ESQUEMAS = process.env.DOCFILLING_ESQUEMAS;
const INFORME = process.env.DOCFILLING_INFORME;

/** Las clases de ERROR que la biblioteca ya tenía el 3-oct-2026, con lo que
 *  significan. El test NO afirma que no haya errores —los hay—: afirma que no
 *  aparece una clase NUEVA. Es el mismo patrón de registro que `oraculo-biblioteca`.
 *
 *  ⚠️ Los números se miden validando **cada párrafo en aislamiento**, y eso
 *  infla algunos: un fragmento que usa campos declarados por su maestro produce
 *  `W056`/`W055`, y uno que abre un `{{IF}}` que cierra el maestro produce
 *  `E010`. En cambio `E050` (DECLARE duplicado en el MISMO fichero) y `E013`
 *  (sintaxis de IF no soportada) son autocontenidos: ésos son reales. */
const ERRORES_CONOCIDOS: Record<string, string> = {
  E001: 'placeholder {{ sin cerrar — REAL, autocontenido (7 casos en total con E001b/c)',
  E001b: 'otro {{ antes de cerrar el anterior — REAL',
  E001c: 'cierre }} sin apertura — REAL',
  E050: 'DECLARE duplicado en el mismo fichero — REAL, autocontenido',
  E013: 'sintaxis de IF no soportada — REAL, autocontenido',
  E010: 'IF sin ENDIF — puede ser del aislamiento si lo cierra el maestro',
  E011: 'ENDIF sin IF — misma duda que E010',
  E014: 'condición de IF mal formada',
  E040: 'FOR EACH / ENDFOR descompensado',
  E061: 'ENDFOR sin FOR EACH',
  E901: 'INCLUDE con ruta — sólo los 2 dejados a propósito, ver abajo',
  // 9-oct-2026, sesión «Catálogo»: los arreglos están en `_DEV_AI` (cola de revisión) y
  // desaparecen de aquí cuando se promocionen a `_PROD`.
  E031: '39 `{{INCLUDE: VAR_X.md}}` con extensión en los enrutadores fiscales de Canarias y Cantabria; el motor ' +
    'corta en el punto y resuelve `VAR_X`, así que no se pierde texto. Arreglo en `_DEV_AI`',
  E090: '4 en PARR_EXP_IV_DIVISION_HORIZONTAL: LINDEROS es una lista anidada (`ITEM.LINDEROS.FRENTE`), uno de ' +
    'los 15 ARRAY mal declarados de F5.24 (PLAN_TECNICO_CALIDAD_MOTOR)',
};

/** Los E9xx que están en la biblioteca A PROPÓSITO, con su motivo. Si aparece uno
 *  más, el test falla: es una errata nueva, no una decisión. */
const E901_ACEPTADOS: Record<string, string> = {
  'PARR_ESTIPULACION_3_TERCERA_FISCAL_3_REDUCCIONES_SUCESION':
    'Gipuzkoa: sus 5 párrafos no llevan {{IF}} y enrutarlos reclamaría las 5 reducciones siempre (DOCFILLING2REPAIR §3.1)',
  'PARR_ESTIPULACION_3_TERCERA_FISCAL_5_BONIFICACIONES_SUCESION':
    'País Vasco: no existe ni el enrutador ni sus hijos (DOCFILLING2REPAIR §2)',
};

function todos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) todos(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
}

const nombreDe = (f: string) => f.split('/').pop()!.replace(/\.md$/, '');

describe.skipIf(!PARRAFOS)('biblioteca', () => {
  it('informe e invariantes decididos', async () => {
    const L: string[] = [];
    const log = (s = '') => L.push(s);

    const ficheros = todos(PARRAFOS!);
    const parrafos: Documento[] = ficheros.map((f) => ({ nombre: nombreDe(f), texto: readFileSync(f, 'utf-8') }));
    const ficherosEsq = ESQUEMAS ? todos(ESQUEMAS) : [];
    const esquemas: Documento[] = ficherosEsq.map((f) => ({ nombre: nombreDe(f), texto: readFileSync(f, 'utf-8') }));

    // El análisis vive en el PAQUETE (`src/biblioteca/analizar.ts`), no aquí: así
    // lo pueden usar Admin y el editor, y tiene sus propios tests sintéticos
    // en `analizar.test.ts` — que es lo que demuestra que la regla funciona,
    // porque un cero sobre la biblioteca real no demuestra nada.
    const a = await analizarBiblioteca(parrafos, esquemas);

    // Los diagnósticos por fichero sí se cuentan aquí: son por documento.
    const porCodigo = new Map<string, number>();
    const e901: Array<{ fichero: string; mensaje: string }> = [];
    for (const d of [...parrafos, ...esquemas]) {
      for (const x of validateText(d.texto).diagnostics) {
        porCodigo.set(x.code, (porCodigo.get(x.code) ?? 0) + 1);
        if (x.code === 'E901') e901.push({ fichero: d.nombre, mensaje: x.message });
      }
    }

    // ── informe ───────────────────────────────────────────────────────────
    log(`BIBLIOTECA · ${parrafos.length} párrafos · ${esquemas.length} esquemas · ${parrafos.length - a.nombresRepetidos.length} nombres distintos`);
    if (a.nombresRepetidos.length) log(`nombres repetidos en distintas carpetas: ${a.nombresRepetidos.length} → ${a.nombresRepetidos.slice(0, 8).join(', ')}`);
    log();
    for (const w of a.advertencias) log(`⚠️  ${w}`);
    if (a.advertencias.length) log();
    log(`1. HUÉRFANOS (existen y nadie los incluye): ${a.huerfanos.length}`);
    log(`   son prosa que ningún documento puede emitir; si falta un enrutador, está aquí`);
    for (const n of a.huerfanos.slice(0, 30)) log(`      ${n}`);
    if (a.huerfanos.length > 30) log(`      … y ${a.huerfanos.length - 30} más`);
    log();
    log(`2. FICHEROS VACÍOS: ${a.vacios.length}, y ${a.vaciosReferenciados.length} de ellos LOS PIDE alguien`);
    log(`   un enrutador de 0 bytes resuelve sin aviso y no emite nada`);
    for (const n of a.vaciosReferenciados) log(`      ${n}`);
    log(`   casi vacíos (< 60 bytes, un solo INCLUDE): ${a.casiVacios.length}`);
    log();
    log(`3. CONDICIONES SIN DECLARACIÓN ALCANZABLE: ${a.condicionesSinDeclaracionAlcanzable.length}`);
    log(`   el párrafo no las declara y sus únicos declarantes son HUÉRFANOS,`);
    log(`   así que el {{IF}} no puede ser cierto nunca y la cláusula no sale`);
    for (const c of a.condicionesSinDeclaracionAlcanzable.slice(0, 25)) log(`      ${c.nombre} — la usan ${c.usadaEn.length} (${c.usadaEn.slice(0, 2).join(', ')}), declarada sólo en huérfanos: ${c.declaradaEnHuerfanos.join(', ')}`);
    log();
    log(`4. INCLUDE SIN RESOLVER: ${a.faltantes.size} nombres distintos`);
    for (const [n, c] of [...a.faltantes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20)) log(`      ${n} — lo piden ${c}`);
    log();
    log(`5. DIAGNÓSTICOS por código — OJO: cada párrafo validado EN AISLAMIENTO,`);
    log(`   así que W056/W055/E010/E011 están inflados (el maestro declara y cierra).`);
    log(`   E050 y E013 sí son autocontenidos: ésos son reales.`);
    for (const [k, v] of [...porCodigo.entries()].sort((a, b) => b[1] - a[1])) log(`      ${k} = ${v}`);
    if (INFORME) { writeFileSync(INFORME, L.join('\n') + '\n'); log(); }
    else console.log(L.join('\n'));

    // ── invariantes DECIDIDOS ─────────────────────────────────────────────
    // No se afirma nada sobre cuántos huérfanos hay —eso es la medición—, sino
    // sobre lo que ya hemos decidido que no debe volver a pasar.
    const inesperados = e901.filter((x) => !(x.fichero in E901_ACEPTADOS));
    expect(inesperados.map((x) => `${x.fichero}: ${x.mensaje}`), 'E901 nuevos: INCLUDE con ruta, que borra la cláusula en silencio').toEqual([]);
    const clasesNuevas = [...porCodigo.keys()]
      .filter((c) => c.startsWith('E') && !(c in ERRORES_CONOCIDOS)).sort();
    expect(clasesNuevas, 'clase de ERROR nueva en la biblioteca: o es una errata recién introducida, o una decisión que hay que anotar en ERRORES_CONOCIDOS').toEqual([]);
  }, 600000);
});
