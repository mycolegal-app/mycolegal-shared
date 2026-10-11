// LA RUTA ESTRECHA HACIA REDACTOR (DR21 de mycolegal-redactor/PLAN_TECNICO_REDACTOR_UI): de Notaría,
// LegiFirma o Pólizas a `/api/inter/tareas/*` de Redactor.
//
// El modal de generación (`GeneracionRedactorModal` de shared/ui) habla con `{apiBase}/tareas/…` de
// SU app; la app resuelve su sesión y reenvía aquí con `X-Service-Key` + `X-Org-Id` + `X-User-Id`,
// porque la clave de servicio no puede ir al navegador. Escrito una vez para las tres: un reenvío por
// app acabaría con tres criterios distintos sobre el mismo canal.
//
// ESTRECHA A PROPÓSITO: sólo `tareas/…`. Lo que sustituye es el catch-all `api/generacion` del
// productor embebido (F11.6), que dejaba pasar TODA la API de generación de Redactor.
//
// Devuelve binarios tal cual (el `.docx` y el PDF): bufferizarlos a texto los corrompería.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export interface ForwardRedactorParams {
  /** URL interna de Redactor (`REDACTOR_INTERNAL_URL`). */
  redactorUrl: string;
  serviceKey: string;
  orgId: string;
  userId: string;
  /** Segmentos tras el prefijo del catch-all de la app (`/api/redactor/[[...path]]`). */
  path?: string[];
  request: NextRequest;
}

const CONSERVAR = ['content-type', 'content-disposition', 'x-fusion-avisos', 'x-plantilla', 'x-borrador'];
const SEGMENTO = /^[A-Za-z0-9_-]{1,80}$/;

export async function forwardRedactor(p: ForwardRedactorParams): Promise<NextResponse> {
  const segs = p.path ?? [];
  // Sólo `tareas` y segmentos limpios: nada de `..`, nada fuera del encargo.
  if (segs[0] !== 'tareas' || !segs.every((s) => SEGMENTO.test(s))) {
    return NextResponse.json({ error: { code: 'RUTA_NO_PERMITIDA' } }, { status: 404 });
  }
  const url = `${p.redactorUrl.replace(/\/$/, '')}/api/inter/${segs.join('/')}${p.request.nextUrl.search}`;
  const headers: Record<string, string> = {
    'X-Service-Key': p.serviceKey,
    'X-Org-Id': p.orgId,
    'X-User-Id': p.userId,
  };
  const metodo = p.request.method;
  const init: RequestInit = {
    method: metodo,
    headers,
    // Contestar un dato puede cerrar el documento (componer, concordancias, archivar) en la misma
    // petición: el techo de un JSON corriente se queda corto.
    signal: AbortSignal.timeout(180000),
  };
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    init.body = await p.request.text();
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    const abortado = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json(
      { error: { code: abortado ? 'REDACTOR_TIMEOUT' : 'REDACTOR_NO_DISPONIBLE' } },
      { status: 504 },
    );
  }
  const salida = new Headers();
  for (const h of CONSERVAR) {
    const v = res.headers.get(h);
    if (v) salida.set(h, v);
  }
  return new NextResponse(res.body, { status: res.status, headers: salida });
}
