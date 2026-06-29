import type { Context } from "@netlify/functions";

type ContractInput = {
  ruta?: { pol?: string; pod?: string };
  carga?: { tipo?: string; categoria?: string; cantidad_mt?: number };
  calculos_previos?: Record<string, unknown>;
  laytimeConfig?: {
    loadPort?: { rules?: string; isIslamic?: boolean };
    dischargePort?: { rules?: string; isIslamic?: boolean };
  };
};

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function fallbackGencon(input: ContractInput) {
  const cargo = String(input.carga?.tipo || "general cargo");
  const loadRules = input.laytimeConfig?.loadPort?.rules || (input.laytimeConfig?.loadPort?.isIslamic ? "FHEX" : "SHEX");
  const dischargeRules = input.laytimeConfig?.dischargePort?.rules || (input.laytimeConfig?.dischargePort?.isIslamic ? "FHEX" : "SHEX");
  const weatherRisk = String(input.calculos_previos?.climatologia_riesgo || "");
  const hasDelayRisk = /alto|moderado|dia|dias|fondeo/i.test(weatherRisk.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const triggers = hasDelayRisk ? "WIBON/WIPON" : "NOR";

  const owner = {
    terms: "FIOS",
    load_laytime: loadRules,
    discharge_laytime: dischargeRules,
    load_laytime_term: loadRules,
    discharge_laytime_term: dischargeRules,
    laytime: loadRules,
    triggers,
    payment: "100% Pre-paid",
    payment_clause: "Freight to be paid 100% pre-paid, strictly Freight Non-Returnable Cargo Lost or Not Lost.",
    rationale: `Protege caja y traslada riesgos operativos del viaje de ${cargo} al fletador.`
  };

  const charterer = {
    terms: "FIOS",
    load_laytime: "SHEX",
    discharge_laytime: "SHEX",
    load_laytime_term: "SHEX",
    discharge_laytime_term: "SHEX",
    laytime: "SHEX",
    triggers: "NOR upon berth reachable on arrival",
    payment: "On Delivery",
    payment_clause: "Freight to be paid 100% on right and true delivery of the cargo at the discharge port.",
    rationale: "Reduce exposicion a congestion, esperas no controlables y pago anticipado."
  };

  return {
    smart_autofill: {
      freight_terms: owner.terms,
      laytime_term: loadRules,
      load_laytime_term: loadRules,
      discharge_laytime_term: dischargeRules,
      triggers_combined: triggers,
      ritmo_carga_final: input.calculos_previos?.ritmo_carga_sugerido,
      ritmo_descarga_final: input.calculos_previos?.ritmo_descarga_sugerido,
      payment_clause: owner.payment_clause,
      ia_rationale: owner.rationale,
    jurisdiction_alert: hasDelayRisk ? "Revisar clausula de muelle alcanzable y tiempo perdido por congestion." : ""
    },
    armador_pro: owner,
    fletador_pro: charterer,
    estrategia_justa: {
      recomendacion: "Usar FIOS con reglas de laytime coherentes por puerto y proteger expresamente congestion o berth availability."
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
            "Return only JSON for a GENCON charter party autofill. Include smart_autofill, armador_pro, fletador_pro and estrategia_justa. Values must be concise maritime chartering terms."
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
    const fallback = fallbackGencon(input);
    const aiData = await askGateway(input).catch(() => null);
    const data = aiData
      ? {
          ...fallback,
          ...aiData,
          smart_autofill: { ...fallback.smart_autofill, ...(aiData.smart_autofill || {}) },
          armador_pro: { ...fallback.armador_pro, ...(aiData.armador_pro || {}) },
          fletador_pro: { ...fallback.fletador_pro, ...(aiData.fletador_pro || {}) }
        }
      : fallback;
    return new Response(JSON.stringify({ success: true, data }), { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return new Response(JSON.stringify({ success: false, error: message }), { status: 400, headers: jsonHeaders });
  }
};

export const config = {
  path: "/api/generate-contract"
};
