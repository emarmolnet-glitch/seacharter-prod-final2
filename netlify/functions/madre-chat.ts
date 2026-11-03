// Keep this boundary independent of cerebro-ia/chat-assistant and their heavy imports.
export const headers: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

export const AI_TIMEOUT_MS = 10_000;
const UPSTREAM = 'https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/madre-chat';

// This function proxies MADRE; pass the DSS directive to its remote prompt context.
export const DIRECTIVA_DSS = "MANDATO CRÍTICO 4 (PROTECCIÓN ALL-IN): El 'Flete ALL-IN GROSS' proporcionado en el contexto ya incluye el recargo por reposicionamiento (lastre) y comisiones. Tienes ESTRICTAMENTE PROHIBIDO proponer una 'Opción B Estratégica' o flete sugerido que sea INFERIOR a ese Flete ALL-IN GROSS. Cualquier incremento para absorber congestión o riesgos operativos debe sumarse siempre por encima del Flete ALL-IN GROSS.";

export function buildStrategicPayload(body: any) {
  const ui = body?.contexto_ui || body?.contexto || body?.context || {};
  const floor = Number(ui.allInRateGross);
  if (!Number.isFinite(floor) || floor <= 0) return body;
  const context = { ...ui, allInRateGross: floor, flete_all_in_gross_usd_mt: floor,
    directiva_dss: DIRECTIVA_DSS };
  const mandate = `${DIRECTIVA_DSS}\nFlete ALL-IN GROSS: USD ${floor.toFixed(2)}/MT (JWC, lastre y comisiones incluidos).`;
  return { ...body, contexto_ui: context, contexto: context,
    systemInstruction: [body.systemInstruction, mandate].filter(Boolean).join('\n'),
    mensajeUsuario: [body.mensajeUsuario || body.mensaje || body.message || body.prompt, mandate].filter(Boolean).join('\n') };
}

export function buildLocalVerdict(body: any, reason: string) {
  const ui = body?.contexto_ui || body?.contexto || body?.context || {};
  const blocks = ui.escaneo_estructurado?.bloques || ui.modulos_1_a_10 || {};
  const finitePositive = (...values: any[]) => {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return null;
  };
  const cargo = finitePositive(blocks.bloque_2_buque_carga_limpieza?.toneladas_carga, ui.cargoQty, ui.parametros_activos?.cargoQty);
  const breakEven = finitePositive(blocks.bloque_6_resumen_operacion_costes?.break_even_usd_mt, ui.breakEvenUnitario, ui.breakEven, ui.parametros_activos?.breakEven);
  const freight = finitePositive(blocks.bloque_10_simulador_negociacion_contraofertas?.flete_venta_fletador_mt, blocks.bloque_7_analisis_fletes_riesgos?.flete_venta_sugerido_mt, ui.fleteUnitario, ui.freightSell);
  const complete = cargo !== null && breakEven !== null && freight !== null;
  const margin = complete ? (freight - breakEven) / freight * 100 : null;
  const verdict = !complete ? 'pendiente_datos' : margin! < 0 ? 'desfavorable' : 'requiere_revision';
  const reply = complete
    ? `MADRE · Veredicto local provisional: ${verdict === 'desfavorable' ? 'flete inferior al break-even' : 'requiere revisión operativa'}. Carga: ${cargo} MT. Break-even: $${breakEven.toFixed(2)}/MT. Flete: $${freight.toFixed(2)}/MT. Margen sobre flete: ${margin!.toFixed(1)}%. Validar costes, ritmos en puerto y cláusulas antes del cierre. La evaluación remota no está disponible.`
    : 'MADRE · Evaluación local pendiente de datos: confirme carga, break-even y flete de venta positivos en la calculadora. La evaluación remota no está disponible; no se puede confirmar la viabilidad comercial.';
  return {
    success: true, fallback: true, source: 'local', fallback_reason: reason,
    veredicto_general: verdict, provisional: true,
    metrics: { cargo_mt: cargo, break_even_usd_mt: breakEven, freight_usd_mt: freight, margin_pct: margin },
    respuesta: reply, reply, message: reply, text: reply, response: reply,
    escaneo_procesado: false, bloques_auditados: 0, timestamp: new Date().toISOString()
  };
}

// The deadline includes receiving/parsing the body, not just receiving headers.
// Promise.race also protects against a transport that ignores AbortSignal.
export async function requestVerdict(body: any, fetchImpl = fetch, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('upstream_timeout'));
        controller.abort();
      }, timeoutMs);
    });
    const remote = (async () => {
      const response = await fetchImpl(UPSTREAM, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildStrategicPayload(body)), signal: controller.signal, redirect: 'error'
      });
      if (!response.ok) throw new Error('upstream_unavailable');
      const data = await response.json();
      const reply = [data?.respuesta, data?.reply, data?.texto_preformateado, data?.message, data?.text, data?.response]
        .find(value => typeof value === 'string' && value.trim());
      if (data?.success === false || !reply) throw new Error('upstream_invalid_response');
      return { ...data, success: true, respuesta: reply, reply };
    })();
    return await Promise.race([remote, deadline]);
  } catch (error) {
    controller.abort();
    const reason = error instanceof Error && error.message === 'upstream_timeout' ? 'upstream_timeout' : 'upstream_unavailable';
    return buildLocalVerdict(body, reason);
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  let body;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }
  return Response.json(await requestVerdict(body), { headers });
}

export default handler;
