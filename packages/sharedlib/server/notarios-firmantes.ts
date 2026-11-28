// =============================================================================
// Quién firma en una notaría: la regla ÚNICA para todas las apps (27-nov-2026).
//
// Antes había dos reglas:
//   - Notaría, Tramitación, LegiFirma y Pólizas: sólo los marcados como firmantes en Config › Notarios
//     (`user_roles.esNotarioFirmante`, #632/#633);
//   - Redactor: el único usuario con rol NOTARIO.
// La del rol es la que no vale. Desde el catálogo unificado (#78), el rol NOTARIO significa «administra la notaría»
// y lo llevan también administrativos, SuperAdmin y soporte: en PROD, Micó tiene dos usuarios con ese rol
// y uno es SuperAdmin.
//
// La marca, por su parte, sólo se pone sola al entrar por primera vez en NOTARÍA, cuando el administrador tiene
// correo notarial oficial (`debeNacerComoNotarioFirmante`). Una notaría que empezó por otra app se quedaba sin
// firmante, aunque quien la dio de alta fuera el propio notario. En PROD, el 27-nov eran 20 notarías, 17 de ellas
// con el notario identificable en el censo por su correo.
//
// La regla:
//   1. Si hay alguien MARCADO como firmante, firman los marcados.
//   2. Si no hay nadie marcado, cuenta el administrador (rol NOTARIO) con correo notarial oficial. Es el mismo
//      criterio con el que Notaría marca al notario al darse de alta, aplicado aunque el alta fuera por otra app.
// El nombre sale de la ficha del CENSO: la vinculada en Config › Notarios o, si no hay, la ficha cuyo correo
// corporativo o secundario es el del usuario, siempre que sea una sola. Si no hay ficha, el nombre del usuario
// (salvo que su nombre sea un correo, que no es un nombre).
// =============================================================================

/** Lo mínimo del cliente Prisma: SQL con parámetros (no todos los mirrors modelan `notarios`). */
export interface DbSqlFirmantes {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

/** Dominios del correo OFICIAL de un notario (Consejo General del Notariado): el corporativo y el secundario. */
export const DOMINIOS_NOTARIALES = ['correonotarial.org', 'notariado.org'] as const;

/** ¿Es un correo notarial oficial? */
export function esCorreoNotarialOficial(email: string | null | undefined): boolean {
  const dominio = (email ?? '').trim().toLowerCase().split('@')[1];
  if (!dominio) return false;
  return DOMINIOS_NOTARIALES.some((d) => dominio === d || dominio.endsWith(`.${d}`));
}

export interface NotarioFirmante {
  /** Id de `user_roles`. Es lo que guardan `notarioFirmanteId` de actuaciones, pólizas, expedientes… */
  id: string;
  /** Nombre con el que firma: el del censo o el del usuario. Null si sólo hay un correo. */
  nombre: string | null;
  /** Para listarlo en un selector: el nombre o, si no lo hay, el nombre de usuario tal cual (puede ser un correo). */
  etiqueta: string;
  /** Población de su plaza, según el censo. Null si no hay ficha del censo. */
  poblacion: string | null;
  /** true: marcado en Config › Notarios. false: elegido por la regla 2 (administrador con correo notarial). */
  marcado: boolean;
  /** Ficha del censo usada para el nombre (vinculada o hallada por correo), o null. */
  notarioDirectorioId: string | null;
}

interface Fila {
  id: string;
  usuario: string | null;
  email: string | null;
  marcado: boolean;
  esAdmin: boolean;
  censoId: string | null;
  censo: string | null;
  poblacion: string | null;
}

// El censo por correo sólo cuenta si la ficha es una sola y está de alta: con dos fichas no sabemos cuál es.
const SELECT_FIRMANTES = `
  SELECT ur.id,
         ur."displayName" AS usuario,
         ur.email,
         ur."esNotarioFirmante" AS marcado,
         (ur.role::text = 'NOTARIO') AS "esAdmin",
         COALESCE(n.id, m.id) AS "censoId",
         COALESCE(NULLIF(TRIM(n."nombreCompleto"), ''), n.nombre, NULLIF(TRIM(m."nombreCompleto"), ''), m.nombre) AS censo,
         COALESCE(pn.nombre, pm.nombre) AS poblacion
    FROM user_roles ur
    LEFT JOIN notarios n ON n.id = ur."notarioDirectorioId"
    LEFT JOIN notario_poblaciones pn ON pn.id = n."poblacionId"
    LEFT JOIN LATERAL (
      SELECT min(x.id) AS id, count(*) AS c
        FROM notarios x
       WHERE ur."notarioDirectorioId" IS NULL
         AND x."fechaBaja" IS NULL
         AND ur.email <> ''
         AND (lower(x."correoCorporativo") = lower(ur.email) OR lower(x."correoSecundario") = lower(ur.email))
    ) porCorreo ON true
    LEFT JOIN notarios m ON m.id = porCorreo.id AND porCorreo.c = 1
    LEFT JOIN notario_poblaciones pm ON pm.id = m."poblacionId"`;

function aFirmante(f: Fila): NotarioFirmante {
  const usuario = f.usuario?.trim() && !f.usuario.includes('@') ? f.usuario.trim() : null;
  return {
    id: f.id,
    nombre: f.censo?.trim() || usuario,
    etiqueta: f.censo?.trim() || f.usuario?.trim() || f.email?.trim() || f.id,
    poblacion: f.poblacion?.trim() || null,
    marcado: !!f.marcado,
    notarioDirectorioId: f.censoId,
  };
}

/**
 * Los notarios que pueden firmar en la organización según la regla de arriba, por nombre. Con uno, es él; con
 * varios, se elige en cada documento; con ninguno, hay que marcarlo en Config › Notarios.
 */
export async function notariosFirmantes(db: DbSqlFirmantes, orgId: string): Promise<NotarioFirmante[]> {
  const filas = await db.$queryRawUnsafe<Fila[]>(
    `${SELECT_FIRMANTES}
      WHERE ur."orgId" = $1 AND ur.active = true
        AND (ur."esNotarioFirmante" = true OR ur.role::text = 'NOTARIO')`,
    orgId,
  );
  const marcados = filas.filter((f) => f.marcado);
  const elegidos = marcados.length
    ? marcados
    : filas.filter((f) => f.esAdmin && esCorreoNotarialOficial(f.email));
  return elegidos.map(aFirmante).sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
}

/** El único firmante de la organización, o null si no hay ninguno o hay varios (ahí decide la persona). */
export async function notarioFirmanteUnico(db: DbSqlFirmantes, orgId: string): Promise<NotarioFirmante | null> {
  const todos = await notariosFirmantes(db, orgId);
  return todos.length === 1 ? todos[0] : null;
}

/**
 * Un firmante concreto (el elegido en el documento), con su nombre y población. Null si no es usuario ACTIVO de
 * esta organización. No comprueba que pueda firmar: para eso, `esNotarioFirmanteDeOrg`.
 */
export async function notarioFirmantePorId(
  db: DbSqlFirmantes,
  orgId: string,
  id: string,
): Promise<NotarioFirmante | null> {
  const filas = await db.$queryRawUnsafe<Fila[]>(
    `${SELECT_FIRMANTES}
      WHERE ur.id = $1 AND ur."orgId" = $2 AND ur.active = true
      LIMIT 1`,
    id,
    orgId,
  );
  return filas[0] ? aFirmante(filas[0]) : null;
}

/** ¿Puede firmar este usuario en esta organización? Para validar el `notarioFirmanteId` que llega de la pantalla. */
export async function esNotarioFirmanteDeOrg(db: DbSqlFirmantes, orgId: string, id: string): Promise<boolean> {
  return (await notariosFirmantes(db, orgId)).some((n) => n.id === id);
}
