import type { Context } from "@netlify/functions";

type ContractInput = {
  ruta?: { pol?: string; pod?: string };
  carga?: { tipo?: string; cantidad_mt?: number };
  calculos_previos?: Record<string, unknown>;
};

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function fallbackTanker(input: ContractInput) {
  const cargo = String(input.carga?.tipo || "liquid bulk cargo");
  const delayRisk = String(input.calculos_previos?.climatologia_riesgo || "");
  const normalizedDelayRisk = delayRisk.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const laytime = /alto|moderado|dia|dias|fondeo/i.test(normalizedDelayRisk) ? "96.0" : "72.0";

  const armador = {
    pumping_guarantee: "Max 24.0 hrs unloading / Min 100 PSI at ship's manifold",
    laytime,
    freight_type: "Worldscale",
    terms_nor: "6 hours notice of readiness or upon connection to hose, whichever occurs first. SHINC.",
    payment: "100% Freight Prepaid",
    rationale: `Protege al armador frente a esperas, bajo rendimiento de terminal y riesgos operativos del viaje de ${cargo}.`
  };

  const fletador = {
    pumping_guarantee: "Vessel to maintain warranted pumping pressure subject to shore receiving capability",
    laytime: "72.0",
    freight_type: "Worldscale",
    terms_nor: "NOR valid only when vessel is in all respects ready and berth reachable on arrival.",
    payment: "Freight payable after completion of discharge against final documents",
    rationale: "Evita demoras imputables a falta de disponibilidad real, preparacion del buque o limitaciones de bombeo."
  };

  return {
    formulario: armador,
    armador_pro: armador,
    fletador_pro: fletador,
    auditoria: {
      riesgo_armador: armador.rationale,
      riesgo_fletador: fletador.rationale,
      posicion_riesgo: /alto|moderado/i.test(normalizedDelayRisk) ? "Riesgo operativo medio/alto" : "Riesgo operativo controlado"
    },
    comparativa: {
      clausula: "NOR, pumping warranty and laytime",
      armador: armador.terms_nor,
      fletador: fletador.terms_nor
    },
    diccionario: [
      { termino: "NOR", definicion: "Notice of Readiness: aviso formal de que el buque esta listo para operar." },
      { termino: "Pumping warranty", definicion: "Garantia de presion o tiempo de bombeo condicionada por la capacidad de tierra." }
    ],
    estrategia_justa: {
      recomendacion: "Combinar NOR valido solo con buque listo y muelle alcanzable con garantia de bombeo condicionada a capacidad de terminal."
    }
  };
}

async function askGateway(input: ContractInput) {
  const baseUrl = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const key = process.env.NETLIFY_AI_GATEWAY_KEY;
  if (!baseUrl || !key) return null;

  const response = await fetch(`${baseUrl}/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON for an ASBATANKVOY tanker charter risk/autofill. Include formulario, armador_pro, fletador_pro, auditoria, comparativa, diccionario and estrategia_justa."
        },
        { role: "user", content: JSON.stringify(input) }
      ]
    })
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return null;
  return JSON.parse(text);
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  try {
    const input = (await req.json()) as ContractInput;
    const fallback = fallbackTanker(input);
    const aiData = await askGateway(input).catch(() => null);
    const data = aiData
      ? {
          ...fallback,
          ...aiData,
          formulario: { ...fallback.formulario, ...(aiData.formulario || {}) },
          armador_pro: { ...fallback.armador_pro, ...(aiData.armador_pro || {}) },
          fletador_pro: { ...fallback.fletador_pro, ...(aiData.fletador_pro || {}) },
          auditoria: { ...fallback.auditoria, ...(aiData.auditoria || {}) },
          comparativa: { ...fallback.comparativa, ...(aiData.comparativa || {}) }
        }
      : fallback;
    return new Response(JSON.stringify({ success: true, data }), { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return new Response(JSON.stringify({ success: false, error: message }), { status: 400, headers: jsonHeaders });
  }
};

export const config = {
  path: "/api/generate-contract-tanker"
};
