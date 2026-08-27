import chatAssistant from "./chat-assistant.js";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function buildAssistantPayload(payload = {}, attachments = []) {
  const rawUserContext = payload.UserContext ?? payload.userContext ?? payload.mensaje ?? "";
  const userContext = typeof rawUserContext === "string"
    ? rawUserContext
    : JSON.stringify(rawUserContext);
  const mensaje = String(payload.mensaje || userContext || "Analiza el contexto operativo y genera una respuesta ejecutiva.").trim();
  const contexto = payload.contexto && typeof payload.contexto === "object"
    ? payload.contexto
    : {
        calculationData: payload.CalculationData || {},
        marketData: payload.MarketData || {},
        userContext: rawUserContext,
        historialChat: payload.ConversationHistory || [],
        attachments,
      };

  return {
    ...payload,
    mensaje,
    contexto,
  };
}

async function parseRequest(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return buildAssistantPayload(await req.json());
  }

  const formData = await req.formData();
  const rawBody = formData.get("body");
  const payload = typeof rawBody === "string" && rawBody.trim() ? JSON.parse(rawBody) : {};
  const attachments = [];
  let image = null;

  for (const [field, value] of formData.entries()) {
    if (field === "body" || typeof value === "string") continue;
    attachments.push({ name: value.name, type: value.type, size: value.size });
    if (!image && value.type.startsWith("image/")) {
      image = {
        data: Buffer.from(await value.arrayBuffer()).toString("base64"),
        mimeType: value.type,
      };
    }
  }

  return {
    ...buildAssistantPayload(payload, attachments),
    ...(image ? { image } : {}),
  };
}

export default async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, { ok: true });
  if (req.method !== "POST") return jsonResponse(405, { success: false, error: "Método no permitido" });

  try {
    const payload = await parseRequest(req);
    const delegatedRequest = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await chatAssistant(delegatedRequest);
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo procesar la solicitud de Cerebro IA.",
    });
  }
};
