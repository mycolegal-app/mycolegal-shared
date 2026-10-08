// Proxy de la respuesta hablada para las apps (F7 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md).
//
// Cada app monta UNA línea en `src/app/api/tts/route.ts`:
//   export const { GET, POST } = createTtsRoute({...})
// El botón 🔊 de `@mycolegal-app/ui` llama a esa ruta y el proxy habla con platform con la service-key:
//
// - GET  → `{ data: { disponible, voz, voces } }`. El botón sólo se pinta si `disponible`: si Google retira el
//   modelo de voz, o la tarea apunta a uno fuera de la UE, platform dice que no y la voz desaparece sin tocar las
//   apps (se cachea un minuto por instancia). `voz` es la que tiene elegida el usuario y `voces`, la lista corta.
// - GET `?muestra=<voz>&idioma=<es|ca|…>` → la frase de muestra de esa voz (mp3), para oírla antes de elegirla.
// - POST `{ texto, idioma, contexto }` → el PCM (24 kHz, mono, 16 bits) en streaming, tal como llega de
//   platform, con la voz del usuario. El navegador lo va reproduciendo con Web Audio; el primer audio sale en
//   ~1-2 s.
// - POST `{ voz }` (sin texto) → guarda la voz elegida por el usuario (F7b). Va por POST para no tener que
//   tocar la ruta de cada app.
//
// El `orgId` y el `userId` salen de la SESIÓN, nunca del cuerpo.
import { NextResponse, type NextRequest } from 'next/server';

/** La respuesta de MycoBot más larga razonable, en markdown. platform la limpia y la acota a ~1.500 caracteres. */
const MAX_TEXTO = 40_000;
const CACHE_ESTADO_MS = 60_000;

type TtsAuth = { orgId: string; authUserId?: string; userId?: string };
type TtsContext = { auth: TtsAuth; params?: Promise<unknown> };
type TtsHandler = (request: NextRequest, context: TtsContext) => Promise<Response>;

export interface TtsRouteConfig {
  platformUrl: string;
  serviceKey: string;
  /** Slug de la app: sólo para las métricas del log de platform. */
  app: string;
  /** withAuth/withSession de la app: rellena context.auth (orgId y usuario). */
  withAuth: (handler: TtsHandler) => TtsHandler;
}

export function createTtsRoute(config: TtsRouteConfig) {
  const base = config.platformUrl.replace(/\/$/, '');
  let estado: { disponible: boolean; expira: number } | null = null;

  const usuario = (auth: TtsAuth) => auth.authUserId ?? auth.userId ?? null;

  /** Estado de la voz para este usuario. `disponible` se cachea; la voz elegida, no (cambia al elegir). */
  async function consultarEstado(userId: string | null) {
    const vacio = { disponible: false, voz: null as string | null, voces: [] as unknown[] };
    if (!base) return vacio;
    if (estado && estado.expira > Date.now() && !estado.disponible) return vacio;
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${base}/internal/tts/estado${qs}`, {
      headers: { 'X-Service-Key': config.serviceKey },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    const j = res?.ok
      ? ((await res.json().catch(() => null)) as { disponible?: unknown; voz?: unknown; voces?: unknown } | null)
      : null;
    // platform antiguo (sin la ruta) o caído: no hay voz, y se vuelve a mirar al minuto.
    const ok = j?.disponible === true;
    estado = { disponible: ok, expira: Date.now() + CACHE_ESTADO_MS };
    return ok
      ? { disponible: true, voz: typeof j?.voz === 'string' ? j.voz : null, voces: Array.isArray(j?.voces) ? j.voces : [] }
      : vacio;
  }

  const GET = config.withAuth(async (request, context) => {
    const url = new URL(request.url);
    const voz = url.searchParams.get('muestra');
    if (voz) {
      if (!base) return NextResponse.json({ error: { code: 'NO_CONFIGURADO' } }, { status: 503 });
      const idioma = url.searchParams.get('idioma') ?? '';
      const res = await fetch(
        `${base}/internal/tts/muestra?voz=${encodeURIComponent(voz)}&idioma=${encodeURIComponent(idioma)}&formato=mp3`,
        { headers: { 'X-Service-Key': config.serviceKey }, signal: AbortSignal.timeout(10_000) },
      ).catch(() => null);
      if (!res?.ok || !res.body) return NextResponse.json({ error: { code: 'SIN_MUESTRA' } }, { status: 404 });
      return new Response(res.body, {
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' },
      });
    }
    return NextResponse.json({ data: await consultarEstado(usuario(context.auth)) });
  });

  const POST = config.withAuth(async (request, context) => {
    const body = (await request.json().catch(() => null)) as
      | { texto?: unknown; idioma?: unknown; contexto?: unknown; voz?: unknown }
      | null;
    // Elegir voz: `{ voz }` sin texto.
    if (body && body.texto === undefined && typeof body.voz === 'string') {
      const userId = usuario(context.auth);
      if (!base || !userId) return NextResponse.json({ error: { code: 'NO_CONFIGURADO' } }, { status: 503 });
      const res = await fetch(`${base}/internal/tts/voz`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
        body: JSON.stringify({ userId, voz: body.voz }),
      }).catch(() => null);
      if (!res?.ok) return NextResponse.json({ error: { code: 'VOZ_NO_VALIDA' } }, { status: res?.status === 400 ? 400 : 502 });
      return NextResponse.json({ data: await res.json() });
    }
    if (typeof body?.texto !== 'string' || !body.texto.trim() || body.texto.length > MAX_TEXTO) {
      return NextResponse.json({ error: { code: 'DATOS_INVALIDOS' } }, { status: 400 });
    }
    if (!base) return NextResponse.json({ error: { code: 'NO_CONFIGURADO' } }, { status: 503 });

    const res = await fetch(`${base}/internal/tts/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: JSON.stringify({
        texto: body.texto,
        idioma: typeof body.idioma === 'string' ? body.idioma : null,
        contexto: typeof body.contexto === 'string' ? body.contexto.slice(0, 60) : null,
        orgId: context.auth.orgId,
        userId: usuario(context.auth),
        app: config.app,
      }),
      // Si quien escucha pulsa ⏹ o cierra la pestaña, se corta también la llamada a platform.
      signal: request.signal,
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: { code: 'VOZ_NO_DISPONIBLE' } }, { status: 503 });
    if (!res.ok || !res.body) {
      if (res.status === 503) estado = { disponible: false, expira: Date.now() + CACHE_ESTADO_MS };
      return NextResponse.json(
        { error: { code: res.status === 503 ? 'VOZ_NO_DISPONIBLE' : 'VOZ_FALLIDA' } },
        { status: res.status === 503 ? 503 : 502 },
      );
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'audio/L16;rate=24000;channels=1',
        'Cache-Control': 'no-store',
        // Que ningún proxy intermedio lo acumule: el sentido es oírlo según llega.
        'X-Accel-Buffering': 'no',
      },
    });
  });

  return { GET, POST };
}
