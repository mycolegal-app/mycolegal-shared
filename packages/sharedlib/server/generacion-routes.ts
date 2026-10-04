// EL PROXY DE GENERACIÓN: de Notaría o LegiFirma a DocFilling.
//
// El modal de la escritura vive en `shared/ui` y toma su `apiBase`, así que una
// app que lo embeba sólo necesita exponer la API de generación bajo una ruta
// propia. Esto es ese reenvío, escrito una vez: si cada app lo escribiera,
// Notaría y LegiFirma acabarían con dos criterios distintos sobre el mismo
// canal — que es exactamente lo que pasó con `inter/{generate,status,bindings}`
// del SaaS, donde hoy uno de los caminos «nunca funcionó».
//
// ⚠️ DOS COSAS QUE ESTE PROXY HACE Y EL DE RESOLUCIONES NO
//
// 1. **Devuelve binarios.** La descarga del `.docx` pasa por aquí, así que la
//    respuesta se reenvía como stream con su `Content-Type` y su
//    `Content-Disposition`. Bufferizarla a texto —como se hace con JSON— la
//    corrompería, y el fichero llegaría ilegible sin que nada diera error.
// 2. **Acepta multipart.** La subida de una plantilla Word es un `.docx` en un
//    formulario: forzar `application/json` destruiría el boundary. El JSON se
//    bufferiza y todo lo demás va por paso directo del stream.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export interface ForwardGeneracionParams {
  /** URL interna de DocFilling. */
  docfillingUrl: string;
  serviceKey: string;
  orgId: string;
  userId: string;
  /** Segmentos tras el prefijo del catch-all. */
  path?: string[];
  request: NextRequest;
}

/** Cabeceras de respuesta que SÍ hay que conservar: sin ellas el navegador no
 *  sabe que es un `.docx` ni cómo llamarlo, y los avisos de la fusión se
 *  pierden —que es información que el oficial necesita—. */
const CONSERVAR = [
  'content-type',
  'content-disposition',
  'x-fusion-avisos',
  'x-plantilla',
  'x-borrador',
];

export async function forwardGeneracion(p: ForwardGeneracionParams): Promise<Response> {
  const segs = p.path ?? [];
  const sub = segs.length ? `/${segs.join('/')}` : '';
  const url = `${p.docfillingUrl.replace(/\/$/, '')}/api/generacion${sub}${p.request.nextUrl.search}`;

  const headers: Record<string, string> = {
    'X-Service-Key': p.serviceKey,
    // Sin esto DocFilling no sabe de qué notaría se habla, y se niega a servir.
    'X-Org-Id': p.orgId,
    'X-User-Id': p.userId,
  };

  const metodo = p.request.method;
  const contentType = p.request.headers.get('content-type') || '';
  const esJson = !contentType || contentType.includes('application/json');

  const init: RequestInit & { duplex?: 'half' } = {
    method: metodo,
    headers,
    // Componer una escritura son 461 párrafos y una fusión OOXML: el techo de
    // 30 s que vale para un JSON se queda corto justo en la operación que más
    // importa.
    signal: AbortSignal.timeout(120000),
  };
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    if (esJson) {
      headers['Content-Type'] = 'application/json';
      init.body = await p.request.text();
    } else {
      // Multipart y binarios: paso directo, conservando el content-type con su
      // boundary.
      headers['Content-Type'] = contentType;
      init.body = p.request.body;
      init.duplex = 'half';
    }
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // Se distingue el timeout del resto: «tardó demasiado» y «no contesta» son
    // problemas distintos y se arreglan en sitios distintos.
    const abortado = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json(
      { error: { code: abortado ? 'GENERACION_TIMEOUT' : 'GENERACION_NO_DISPONIBLE' } },
      { status: 504 },
    );
  }

  const salida = new Headers();
  for (const h of CONSERVAR) {
    const v = res.headers.get(h);
    if (v) salida.set(h, v);
  }
  // El cuerpo se reenvía TAL CUAL: vale para JSON y para el `.docx`.
  return new Response(res.body, { status: res.status, headers: salida });
}
