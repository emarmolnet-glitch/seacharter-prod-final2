export const CHAT_INTENTS = Object.freeze({
  SIMULATION: "SIMULACION_FLETE",
  MARKET_INFO: "INFO_MERCADO",
  GENERAL: "PREGUNTA_GENERAL",
});

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasVoyageContext(context = {}) {
  const draft = context.draftVoyage || context.viaje || {};
  const moduleData = context.datosModulo || {};
  return Boolean(
    (draft.POL || draft.pol || moduleData.pol)
    && (draft.POD || draft.pod || moduleData.pod),
  );
}

export function hasOperationalSimulationUpdate(message, context = {}) {
  const text = normalizeText(message);
  return hasVoyageContext(context)
    && /\b(?:ritmo|carga|descarga|grua|gruas|laytime|shinc|shex|fhex)\b/.test(text)
    && /\b\d[\d.,]*\b/.test(text);
}

export function hasSimulationRouteAndVolume(message) {
  const text = normalizeText(message);
  const hasVolume = /\b\d[\d.,]*\s*(?:mt|tm|ton(?:elada)?s?)\b/.test(text);
  const hasExplicitPorts = /\bpol\b[\s\S]*\bpod\b|\bpod\b[\s\S]*\bpol\b/.test(text);
  const hasRoutePhrase = /\b(?:desde|de)\s+[\p{L}][\p{L}\s.'-]{1,50}\s+(?:a|hasta|hacia)\s+[\p{L}][\p{L}\s.'-]{1,50}/u.test(text);
  return hasVolume && (hasExplicitPorts || hasRoutePhrase);
}

export function classifyChatIntent(message, options = {}) {
  const text = normalizeText(message);
  const conversationState = normalizeText(options.conversationState);
  const context = options.context && typeof options.context === "object" ? options.context : {};

  const asksMarketInformation = /\b(?:bunker|bunkers|bunker|combustible|vlsfo|mgo|ifo|clima|meteorolog|weather|pronostico|prevision|oleaje|viento|lluvia|ais|posicion|ubicacion|donde esta|mercado|baltic|ffa|indice|indices|cotizacion general|fletes? (?:de mercado|actuales|generales))\b/.test(text);
  const startsSimulation = /\b(?:simula|simular|simulacion|calcula|calcular|calculo|cotiza|cotizar|estimacion|estimar|presupuesta|presupuestar|inicia|iniciar|crear|preparar)\b[\s\S]{0,45}\b(?:flete|fletamento|viaje|ruta|operacion|transporte)\b|\b(?:quiero|necesito|vamos a)\b[\s\S]{0,35}\b(?:simular|calcular|cotizar|estimar)\b/.test(text);
  const continuesOperationalSetup = hasOperationalSimulationUpdate(text, context);

  if (asksMarketInformation) return CHAT_INTENTS.MARKET_INFO;
  if (conversationState === "simulacion_flete_activa") return CHAT_INTENTS.SIMULATION;
  if (hasSimulationRouteAndVolume(text) || startsSimulation || continuesOperationalSetup) {
    return CHAT_INTENTS.SIMULATION;
  }
  return CHAT_INTENTS.GENERAL;
}
