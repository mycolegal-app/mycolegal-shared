// Proxy de la transcripción de voz para las apps (F2 de mycolegal-platform/PLAN_TECNICO_TRANSCRIPCION.md).
//
// Cada app monta UNA línea: `export const { POST } = createTranscribeRoute({...})` en
// `src/app/api/transcribe/route.ts`. El botón de dictado de `@mycolegal-app/ui` llama a esa ruta
// con el audio, y el proxy lo reenvía a `POST /internal/transcribe` de platform con la service-key.
//
// El `orgId` y el `userId` salen de la SESIÓN, nunca del cuerpo (D10). El tamaño se comprueba
// con `Content-Length` ANTES de leer el cuerpo: 120 s de audio caben de sobra (≈0,5 MB en opus,
// ≈4 MB en WAV), y algo mayor no es un dictado.
import { NextResponse, type NextRequest } from 'next/server';

/** 4 MB de audio en base64 (+33 %) más el JSON. */
const MAX_CUERPO = 6 * 1024 * 1024;

type TranscribeAuth = { orgId: string; authUserId?: string; userId?: string };
type TranscribeContext = { auth: TranscribeAuth; params?: Promise<unknown> };
type TranscribeHandler = (request: NextRequest, context: TranscribeContext) => Promise<Response>;

export interface TranscribeRouteConfig {
  platformUrl: string;
  serviceKey: string;
  /** Slug de la app: sólo para las métricas del log de platform. */
  app: string;
  /** withAuth/withSession de la app: rellena context.auth (orgId y usuario). */
  withAuth: (handler: TranscribeHandler) => TranscribeHandler;
}

export function createTranscribeRoute(config: TranscribeRouteConfig) {
  const base = config.platformUrl.replace(/\/$/, '');

  const POST = config.withAuth(async (request, context) => {
    const declarado = Number(request.headers.get('content-length') || 0);
    if (declarado > MAX_CUERPO) {
      return NextResponse.json({ error: { code: 'AUDIO_DEMASIADO_GRANDE' } }, { status: 413 });
    }
    const body = (await request.json().catch(() => null)) as
      | { audioBase64?: unknown; mimeType?: unknown; idioma?: unknown; contexto?: unknown }
      | null;
    if (typeof body?.audioBase64 !== 'string' || typeof body?.mimeType !== 'string') {
      return NextResponse.json({ error: { code: 'DATOS_INVALIDOS' } }, { status: 400 });
    }
    if (!base) return NextResponse.json({ error: { code: 'NO_CONFIGURADO' } }, { status: 503 });

    const res = await fetch(`${base}/internal/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: JSON.stringify({
        audioBase64: body.audioBase64,
        mimeType: body.mimeType,
        idioma: typeof body.idioma === 'string' ? body.idioma : null,
        contexto: typeof body.contexto === 'string' ? body.contexto.slice(0, 60) : null,
        orgId: context.auth.orgId,
        userId: context.auth.authUserId ?? context.auth.userId ?? null,
        app: config.app,
      }),
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: { code: 'TRANSCRIPCION_NO_DISPONIBLE' } }, { status: 503 });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      // Códigos de platform → códigos estables para la UI (no se filtran detalles internos).
      const code =
        res.status === 413 ? 'AUDIO_DEMASIADO_GRANDE'
          : res.status === 400 ? 'FORMATO_NO_ADMITIDO'
            : 'TRANSCRIPCION_FALLIDA';
      return NextResponse.json({ error: { code } }, { status: res.status === 413 || res.status === 400 ? res.status : 502 });
    }
    return NextResponse.json({ data });
  });

  return { POST };
}
