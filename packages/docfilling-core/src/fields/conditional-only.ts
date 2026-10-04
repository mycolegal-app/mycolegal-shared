// Campos que sólo gobiernan un IF (o son DECLARE auxiliares) y nunca se pintan.
//
// Port de `identify_conditional_only_fields` de `filler.py`. Importa porque es
// **el mismo criterio que usa el procesado para decidir si una tarea está
// completa**: un campo conditional-only que falte NO deja la tarea `incomplete`.
// Si este cálculo se desvía, la frontera pedirá datos que no hacen falta (o
// dejará de pedir los que sí).

const PALABRAS_CONDICIONALES = ['IF', 'ELSE', 'ENDIF'] as const;

/** Quita el sufijo `:HELP(fichero)` del cuerpo de un campo. */
function quitarHelp(cuerpo: string): string {
  return cuerpo.replace(/:HELP\([^)]*\)/gi, '');
}

export interface ContextoCampos {
  /** Campos de sistema (DIA, MES, AÑO, ANO…): los resuelve el motor. */
  camposDeSistema: Set<string>;
  /** Campos predefinidos por la organización. En el SaaS vienen de la tabla
   *  `Settings`; aquí los aporta el `SettingsProvider` de la app. */
  camposPredefinidos: Set<string>;
}

export function camposSoloCondicionales(
  plantilla: string,
  ctx: ContextoCampos,
): Set<string> {
  const { camposDeSistema, camposPredefinidos } = ctx;
  const esConocido = (n: string) => camposDeSistema.has(n) || camposPredefinidos.has(n);

  // 1) Los que se PINTAN: cualquier {{...}} que no sea directiva.
  const pintados = new Set<string>();
  for (const m of plantilla.matchAll(/\{\{([^}]+)\}\}/g)) {
    const cuerpo = quitarHelp(m[1]);
    if (
      PALABRAS_CONDICIONALES.some(
        (k) => cuerpo.includes(`${k} `) || cuerpo.includes(`${k}_`) || cuerpo === k,
      )
    ) continue;
    if (cuerpo.startsWith('@autonumber:')) continue;
    if (cuerpo.startsWith('DECLARE ')) continue;
    if (cuerpo.toUpperCase().startsWith('MAP_IUI:')) continue;
    if (cuerpo.toUpperCase().startsWith('DEPENDENCY:')) continue;

    const nombre = cuerpo.split('==')[0].split('!=')[0].split(':')[0].trim();
    if (!esConocido(nombre)) pintados.add(nombre);
  }

  // 2) Los que aparecen en condicionales.
  const condicionales = new Set<string>();
  for (const m of plantilla.matchAll(/\{\{IF_([^}]+)\}\}/g)) {
    if (!esConocido(m[1])) condicionales.add(m[1]);
  }
  for (const m of plantilla.matchAll(/\{\{IF\s+([^}]+)\}\}/g)) {
    const nombre = m[1].split('==')[0].split('!=')[0].trim();
    if (!esConocido(nombre)) condicionales.add(nombre);
  }

  // 3) Los DECLARE: auxiliares por definición, siempre conditional-only.
  const declarados = new Set<string>();
  const reDeclare = /\{\{DECLARE\s+([\p{L}\p{N}_]+)(?:\s+AS\s+[\p{L}\p{N}_]+)?(?:\s*[=:][^}]*)?\}\}/giu;
  for (const m of plantilla.matchAll(reDeclare)) {
    declarados.add(m[1]);
    condicionales.add(m[1]);
  }

  const salida = new Set<string>();
  for (const n of condicionales) if (!pintados.has(n)) salida.add(n);
  for (const n of declarados) salida.add(n);
  return salida;
}
