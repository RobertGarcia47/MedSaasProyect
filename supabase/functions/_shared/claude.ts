// Llamada genérica a la API de Claude con salida estructurada (tool use forzado). Solo usa fetch:
// no depende de Deno ni de Supabase, así que también se prueba con Node. Cada función de IA
// (resumen, CIE-10…) pone su propio prompt y su propia herramienta; el manejo de errores,
// el tiempo límite y la lectura de tokens viven aquí una sola vez.

export class ErrorIA extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export interface UsoTokens { input_tokens: number; output_tokens: number }

export const MODELO_DEFECTO = 'claude-haiku-5-5';

export interface HerramientaClaude {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface OpcionesLlamada {
  apiKey: string;
  modelo?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxTokens?: number;
}

/** Pide a Claude que responda SOLO llamando a `herramienta`; devuelve lo que puso en sus argumentos. */
export async function llamarHerramienta(
  p: { system: string; mensaje: string; herramienta: HerramientaClaude },
  op: OpcionesLlamada,
): Promise<{ entrada: Record<string, unknown>; uso: UsoTokens; modelo: string }> {
  const modelo = op.modelo || MODELO_DEFECTO;
  const f = op.fetchFn ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), op.timeoutMs ?? 45_000);
  let res: Response;
  try {
    res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': op.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: op.maxTokens ?? 1500,
        system: p.system,
        tools: [p.herramienta],
        tool_choice: { type: 'tool', name: p.herramienta.name },
        messages: [{ role: 'user', content: p.mensaje }],
      }),
    });
  } catch (e) {
    throw new ErrorIA((e as Error).name === 'AbortError' ? 'La IA tardó demasiado en responder. Intenta de nuevo.' : 'No se pudo contactar al servicio de IA.', 504);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detalle = '';
    try { detalle = (await res.json())?.error?.message ?? ''; } catch { /* sin cuerpo */ }
    if (res.status === 401) throw new ErrorIA('La clave de la API de IA no es válida. Revisa el secreto ANTHROPIC_API_KEY.', 502);
    if (res.status === 429) throw new ErrorIA('Se alcanzó el límite de uso de la IA. Intenta en un momento.', 429);
    if (res.status === 400 && /credit|balance/i.test(detalle)) throw new ErrorIA('La cuenta de IA no tiene saldo. Agrega crédito en la consola de Anthropic.', 402);
    throw new ErrorIA(`El servicio de IA respondió con error ${res.status}${detalle ? `: ${detalle}` : ''}`, 502);
  }

  const data = await res.json();
  const bloque = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  const entrada = bloque?.input;
  if (!entrada || typeof entrada !== 'object') throw new ErrorIA('La IA no devolvió una respuesta válida. Intenta de nuevo.');
  return {
    entrada: entrada as Record<string, unknown>,
    uso: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
    modelo: data.model ?? modelo,
  };
}
