import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { JWT_COOKIE_NAME } from '../config';

/**
 * Reenviador COMPARTIDO de tutoriales (#904). Mismo papel que
 * `createForoRoutes`, pero con una diferencia que manda en el diseño: el Foro lo
 * hospeda otra app Next (Consultor), que sabe autenticar una cookie de sesión;
 * los tutoriales los sirve **platform**, que es un servicio interno y solo
 * entiende `X-Service-Key`.
 *
 * De ahí el reparto: la RUTA DE LA APP comprueba que hay sesión válida —esto se
 * monta en el dominio de la app, con su cookie— y solo entonces llama a platform
 * con la clave de servicio. Nunca se expone la clave al navegador ni se deja
 * pasar una petición anónima.
 *
 * Por qué platform y no Consultor: el panel de vídeos vive en el «?» de TODAS
 * las apps. Sirviéndolo Consultor, una organización que no lo tenga contratado
 * pediría a Consultor los vídeos de ayuda de su Notaría, y la frontera de app
 * contratada (#898) lo cortaría. Los tutoriales son transversales.
 *
 *   // src/app/api/tutoriales/[[...path]]/route.ts   (en cada app consumidora)
 *   import { createTutorialesRoutes } from '@mycolegal-app/sharedlib/server/tutoriales-routes';
 *   export const dynamic = 'force-dynamic';
 *   export const runtime = 'nodejs';
 *   export const { GET } = createTutorialesRoutes({ appSlug: 'notaria' });
 *
 * Solo GET: el mantenimiento del catálogo es cosa de Admin, que va por su propio
 * proxy de superadmin. Aquí no se escribe nada.
 */
export interface TutorialesRoutesOptions {
  /** App que pregunta: filtra el catálogo a los suyos + los transversales. */
  appSlug: string;
  /** Base interna de platform. Por defecto, `PLATFORM_SERVICE_URL` del entorno. */
  platformUrl?: string;
  /** Clave de servicio. Por defecto, `APPS_REGISTER_SECRET` del entorno. */
  serviceKey?: string;
  /** Nombre de la cookie de sesión. Por defecto la del ecosistema. */
  cookieName?: string;
}

type CatchAllCtx = { params: Promise<{ path?: string[] }> };

/** ¿Hay una sesión válida en esta petición? No mira permisos: los tutoriales
 *  son material de ayuda, y lo único que se protege es que no sean públicos. */
async function haySesion(cookieName: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    const store = await cookies();
    const token = store.get(cookieName)?.value;
    if (!token) return false;
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export function createTutorialesRoutes(opts: TutorialesRoutesOptions) {
  const cookieName = opts.cookieName ?? JWT_COOKIE_NAME;

  async function GET(request: NextRequest, ctx: CatchAllCtx): Promise<NextResponse> {
    const base = (opts.platformUrl ?? process.env.PLATFORM_SERVICE_URL ?? '').replace(/\/+$/, '');
    const key = opts.serviceKey ?? process.env.APPS_REGISTER_SECRET ?? '';
    if (!base || !key) {
      // Sin cablear: el panel del «?» lo trata como "no hay tutoriales" y no
      // enseña la entrada, en vez de sacarle un error al usuario.
      return NextResponse.json({ data: [] });
    }
    if (!(await haySesion(cookieName))) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesión requerida' } },
        { status: 401 },
      );
    }

    const { path } = await ctx.params;
    const segmentos = (path ?? []).map(encodeURIComponent);

    // Dos formas y ninguna más: el catálogo de esta app, y los bytes de una
    // diapositiva. Cualquier otra cosa no se reenvía — este reenviador está en
    // el borde público y no debe ser una ventana abierta a `/internal/*`.
    let destino: string;
    if (segmentos.length === 0) {
      destino = `${base}/internal/tutoriales/catalogo?appSlug=${encodeURIComponent(opts.appSlug)}`;
    } else if (segmentos.length === 1) {
      destino = `${base}/internal/tutoriales/${segmentos[0]}`;
    } else if (segmentos.length === 3 && segmentos[1] === 'slide') {
      destino = `${base}/internal/tutoriales/${segmentos[0]}/slide/${segmentos[2]}`;
    } else {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Ruta no disponible' } },
        { status: 404 },
      );
    }

    try {
      const res = await fetch(destino, {
        headers: { 'X-Service-Key': key },
        cache: 'no-store',
      });
      const tipo = res.headers.get('content-type') ?? 'application/json';
      // Las diapositivas son binario: pasa-through sin reinterpretar.
      if (!tipo.includes('application/json')) {
        const buf = await res.arrayBuffer();
        return new NextResponse(buf, {
          status: res.status,
          headers: {
            'Content-Type': tipo,
            'Cache-Control': res.headers.get('cache-control') ?? 'private, max-age=3600',
          },
        });
      }
      const texto = await res.text();
      return new NextResponse(texto, {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return NextResponse.json(
        { error: { code: 'UPSTREAM', message: 'No se pudieron obtener los tutoriales' } },
        { status: 502 },
      );
    }
  }

  return { GET };
}
