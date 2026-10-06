// EL BUCLE AGÉNTICO: modelo + herramientas, hasta que contesta.
//
// Esto NO estaba copiado en ningún sitio: estaba **dentro** de Consultor, pegado
// a sus resoluciones. Es la pieza que hacía imposible que otra app tuviera un
// MycoBot sin reescribirlo.
//
// QUÉ HACE, Y QUÉ NO
//
// Hace el ciclo: manda la conversación con las declaraciones de herramientas,
// recibe o un texto (y termina) o peticiones de función; las ejecuta, mete los
// resultados y vuelve. Nada más.
//
// **No decide qué herramientas hay** —eso es de cada app, y en Redactor es
// justo donde está la decisión de diseño: `escribir` no existe (D31)—, no sabe
// de créditos ni de permisos, y no inventa un modelo: se le da.
//
// LAS TRES COSAS QUE PROTEGE, Y POR QUÉ CADA UNA
//
// 1. **Tope de vueltas.** Un modelo puede pedir herramientas en bucle. Sin tope,
//    una pregunta mal planteada se come el presupuesto de tokens del día. Al
//    llegar al tope se devuelve lo que haya con `agotado: true`, que es
//    información, no un error.
//
// 2. **Una herramienta que falla no tumba la conversación.** Se le devuelve al
//    modelo el error como resultado, y decide. Si la excepción subiera, el
//    usuario vería «error» donde el modelo podía haber dicho «ese esquema no
//    existe, quizá te refieres a…».
//
// 3. **El consumo se acumula y se devuelve.** Quien llama tiene que poder
//    imputarlo: en Redactor la conversación es `meterMode: 'none'` —medida y
//    no facturada—, y sin estos números eso no se puede cumplir.

export interface DeclaracionHerramienta {
  name: string;
  description: string;
  parameters?: unknown;
}

/** Ejecuta una herramienta. Devuelve lo que se le dará al modelo como resultado. */
export type EjecutarHerramienta = (
  nombre: string,
  args: Record<string, unknown>,
) => Promise<{ texto: string; extra?: Record<string, unknown> }>;

export interface PasoAgente {
  vuelta: number;
  herramienta: string;
  args: Record<string, unknown>;
  /** Recorte del resultado, para poder enseñar los pasos sin volcar el contexto. */
  resumen: string;
  ms: number;
  error?: string;
}

export interface ResultadoAgente {
  texto: string;
  pasos: PasoAgente[];
  tokensIn: number;
  tokensOut: number;
  /** Se alcanzó el tope de vueltas sin que el modelo diera una respuesta final. */
  agotado: boolean;
  /** Lo que las herramientas devolvieron en `extra`, acumulado por nombre. */
  extras: Record<string, unknown[]>;
}

export interface OpcionesAgente {
  /** Llama al modelo. Se inyecta para no atar este módulo a Vertex ni a su auth. */
  llamar: (cuerpo: unknown) => Promise<unknown>;
  systemPrompt: string;
  pregunta: string;
  /** Turnos anteriores, en orden. Vacío = conversación nueva. */
  historia?: { rol: 'user' | 'model'; texto: string }[];
  herramientas: readonly DeclaracionHerramienta[];
  ejecutar: EjecutarHerramienta;
  /** Tope de vueltas de herramientas. Por defecto 6. */
  maxVueltas?: number;
}

interface Parte {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  /** Gemini 3: firma del razonamiento que acompaña a un `functionCall`. Hay que
   *  devolverla tal cual en la vuelta siguiente o la API responde 400. */
  thoughtSignature?: string;
}
interface Contenido { role: 'user' | 'model' | 'function'; parts: Parte[] }

export async function conversarConHerramientas(o: OpcionesAgente): Promise<ResultadoAgente> {
  const maxVueltas = o.maxVueltas ?? 6;
  const contents: Contenido[] = [
    ...(o.historia ?? []).map((h) => ({ role: h.rol, parts: [{ text: h.texto }] } as Contenido)),
    { role: 'user', parts: [{ text: o.pregunta }] },
  ];
  const pasos: PasoAgente[] = [];
  const extras: Record<string, unknown[]> = {};
  let tokensIn = 0, tokensOut = 0;

  for (let vuelta = 1; vuelta <= maxVueltas; vuelta++) {
    const data = await o.llamar({
      contents,
      systemInstruction: { parts: [{ text: o.systemPrompt }] },
      tools: [{ functionDeclarations: o.herramientas }],
    }) as {
      candidates?: { content?: { parts?: Parte[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    tokensIn += data.usageMetadata?.promptTokenCount ?? 0;
    tokensOut += data.usageMetadata?.candidatesTokenCount ?? 0;

    const partes = data.candidates?.[0]?.content?.parts ?? [];
    const llamadas = partes.filter((p) => p.functionCall).map((p) => p.functionCall!);

    if (llamadas.length === 0) {
      // Respuesta final: el modelo ya no pide nada.
      const texto = partes.map((p) => p.text ?? '').join('').trim();
      return { texto, pasos, tokensIn, tokensOut, agotado: false, extras };
    }

    // Se guarda lo que el modelo pidió ANTES de ejecutar: el protocolo exige que
    // la petición esté en la conversación para que la respuesta case con ella.
    //
    // ⚠️ El turno del modelo va ENTERO, tal como llegó, y no reconstruido con sólo
    // sus `functionCall`: Gemini 3 adjunta a cada llamada una `thoughtSignature` que
    // exige de vuelta («Function call is missing a thought_signature», 400). Con la
    // reconstrucción, cualquier conversación que usara una herramienta fallaba en la
    // segunda vuelta (medido el 7-oct-2026 con gemini-3.7-flash en Redactor).
    contents.push({ role: 'model', parts: partes });

    const respuestas: Parte[] = [];
    for (const c of llamadas) {
      const t0 = Date.now();
      const args = c.args ?? {};
      try {
        const r = await o.ejecutar(c.name, args);
        if (r.extra) {
          for (const [k, v] of Object.entries(r.extra)) {
            (extras[k] ??= []).push(v);
          }
        }
        respuestas.push({ functionResponse: { name: c.name, response: { resultado: r.texto } } });
        pasos.push({ vuelta, herramienta: c.name, args, resumen: r.texto.slice(0, 200), ms: Date.now() - t0 });
      } catch (err) {
        // Al modelo, no al usuario: ver el punto 2 de la cabecera.
        const mensaje = err instanceof Error ? err.message : String(err);
        respuestas.push({ functionResponse: { name: c.name, response: { error: mensaje } } });
        pasos.push({ vuelta, herramienta: c.name, args, resumen: '', ms: Date.now() - t0, error: mensaje });
      }
    }
    contents.push({ role: 'function', parts: respuestas });
  }

  // Tope alcanzado. Se devuelve lo que se sabe, dicho como lo que es.
  return {
    texto: '',
    pasos, tokensIn, tokensOut, agotado: true, extras,
  };
}
