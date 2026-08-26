import DOMPurify from "dompurify";
import { marked } from "marked";
import { evaluateBasicRisks } from "./basic-risk-evaluator.js";
import { evaluateModuleSuggestions, SUPPORTED_MODULES } from "./universal-module-suggestions.js";

const DEFAULT_CEREBRO_IA_ENDPOINT = "[https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/cerebro-ia](https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/cerebro-ia)";
const DEFAULT_CHAT_ASSISTANT_ENDPOINT = "[https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/chat-assistant](https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/chat-assistant)";
const REQUEST_TIMEOUT_MS = 45_000;
const AI_HISTORY_LIMIT = 6;
const AI_HISTORY_MESSAGE_MAX_CHARS = 2_000;
const AI_USER_CONTEXT_MAX_CHARS = 8_000;
const AI_DATA_TEXT_MAX_CHARS = 1_000;
const SPEECH_PREFERENCE_KEY = "seacharter-assistant-voice-enabled";
const MODULE_LABELS = Object.freeze({
  map: "Mapa",
  estimator: "Calculadora",
  decisiones: "Decisiones",
  tracking: "Tracking",
  ais: "Densidad",
  matching: "Coincidencia",
  gencon: "Editor",
  asbatankvoy: "EDITOR ASBATANKVOY",
  auditor: "Auditoría",
  fcl: "FCL",
  cbam: "CBAM",
});

const icons = {
  assistant: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 15.5c3.2-5.1 6.2-7.7 9-7.7 2.6 0 4.9 1.7 7 5.2" />
      <path d="M4 18.5c3.1-2 6-3 8.8-3 2.4 0 4.8.7 7.2 2.2" />
      <path d="M12 4v3.8" />
      <path d="m9.8 5.3 2.2-2 2.2 2" />
    </svg>`,
  send: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-7-5.8 14-2.8-5.7L4 12Z" />
      <path d="m11.4 13.3 3.5-3.4" />
    </svg>`,
  microphone: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>`,
  speaker: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z" />
      <path d="M15 9a4.2 4.2 0 0 1 0 6" />
      <path d="M17.7 6.4a8 8 0 0 1 0 11.2" />
    </svg>`,
  speakerMuted: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z" />
      <path d="m15.5 9.5 5 5" />
      <path d="m20.5 9.5-5 5" />
    </svg>`,
  stop: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>`,
  minimize: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>`,
  close: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10" />
      <path d="m17 7-10 10" />
    </svg>`,
};

function createMessage(role, text, options = {}) {
  const message = document.createElement("article");
  message.className = `sca-message sca-message--${role}${options.error ? " sca-message--error" : ""}`;
  message.dataset.role = role;
  message.dataset.messageText = String(text || "");

  const bubble = document.createElement("div");
  bubble.className = "sca-bubble p-3 rounded-xl break-words text-[13px]";
  if (role === "assistant" && !options.error) {
    bubble.classList.add("sca-markdown");
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(text, {
      async: false,
      breaks: true,
      gfm: true,
    }));
    bubble.querySelectorAll("a[href]").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  } else {
    bubble.textContent = text;
  }
  message.appendChild(bubble);

  if (options.meta) {
    const meta = document.createElement("span");
    meta.className = "sca-meta";
    meta.textContent = options.meta;
    message.appendChild(meta);
  }

  return message;
}

function collectConversationHistory(historyElement) {
  return Array.from(historyElement?.querySelectorAll?.("[data-role][data-message-text]") || [])
    .filter((message) => message.dataset.thinking !== "true")
    .slice(-12)
    .map((message) => ({
      role: message.dataset.role === "assistant" ? "assistant" : "user",
      content: String(message.dataset.messageText || "").trim(),
    }))
    .filter((entry) => entry.content);
}

function sanitizeAiText(value, maxLength = AI_DATA_TEXT_MAX_CHARS) {
  const text = String(value ?? "").trim();
  if (/^data:[^;]+;base64,/i.test(text)) return "[contenido binario omitido]";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function sanitizeAiScalar(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "string") return sanitizeAiText(value);
  return undefined;
}

function pickAiFields(source, fieldNames) {
  const record = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return Object.fromEntries(fieldNames.flatMap((fieldName) => {
    const value = sanitizeAiScalar(record[fieldName]);
    return value === undefined ? [] : [[fieldName, value]];
  }));
}

function sanitizePayloadForAI(payload = {}) {
  const calculationData = payload.CalculationData && typeof payload.CalculationData === "object"
    ? payload.CalculationData
    : {};
  const marketData = payload.MarketData && typeof payload.MarketData === "object"
    ? payload.MarketData
    : {};
  const conversationHistory = Array.isArray(payload.ConversationHistory)
    ? payload.ConversationHistory
    : [];

  return {
    CalculationData: {
      ...pickAiFields(calculationData, ["generatedAt"]),
      activeCalculator: pickAiFields(calculationData.activeCalculator, ["id", "name"]),
      route: pickAiFields(calculationData.route, ["pol", "pod", "ballastPort", "distanceNm", "laycanStart", "laycanEnd"]),
      cargo: pickAiFields(calculationData.cargo, ["tonnes", "type", "packaging", "stowageFactor", "tolerancePercent"]),
      operations: pickAiFields(calculationData.operations, [
        "loadingMethod",
        "dischargeMethod",
        "loadingRateTonnesDay",
        "dischargeRateTonnesDay",
        "loadingLaytime",
        "dischargeLaytime",
        "totalDays",
        "portDays",
        "ballastSpeedKnots",
        "ladenSpeedKnots",
      ]),
      commercial: pickAiFields(calculationData.commercial, [
        "freightBuyUsdTon",
        "freightSellUsdTon",
        "breakEvenUsdTon",
        "tceUsdDay",
        "ownerMarginPercent",
        "chartererMarginPercent",
        "commissionPercent",
      ]),
    },
    MarketData: {
      ...pickAiFields(marketData, ["generatedAt", "bdi"]),
      bunkers: pickAiFields(marketData.bunkers, ["region", "vlsfoUsdTon", "ifo380UsdTon", "mgoUsdTon"]),
      carbon: pickAiFields(marketData.carbon, ["euAllowanceEurTon", "etsRouteFactor"]),
      freightBenchmarks: pickAiFields(marketData.freightBenchmarks, ["fleteCalculado", "ofertaCliente", "spot", "coa", "backhaul"]),
      aisFreightRates: pickAiFields(marketData.aisFreightRates, ["fair", "standard", "offmarket"]),
    },
    UserContext: sanitizeAiText(payload.UserContext, AI_USER_CONTEXT_MAX_CHARS),
    ConversationHistory: conversationHistory
      .slice(-AI_HISTORY_LIMIT)
      .map((entry) => ({
        role: entry?.role === "assistant" ? "assistant" : "user",
        content: sanitizeAiText(entry?.content, AI_HISTORY_MESSAGE_MAX_CHARS),
      }))
      .filter((entry) => entry.content),
  };
}

function createThinkingMessage() {
  const message = document.createElement("article");
  message.className = "sca-message sca-message--assistant";
  message.dataset.thinking = "true";
  message.innerHTML = `
    <div class="sca-bubble sca-thinking p-3 rounded-xl break-words text-[13px]" role="status">
      <span>El asistente está pensando</span>
      <span class="sca-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
    </div>`;
  return message;
}

// --- 1. DETECTOR DE INTENCIÓN ---
function isSimulationQuery(mensaje) {
  const msgLower = (mensaje || "").toLowerCase();
  const simulationKeywords = ['transportar', 'viaje', 'cotizar', 'simular', 'calcular ruta', 'flete'];
  const tieneToneladas = /\b\d+(\.\d+)?\s*(mt|tn|tons|toneladas)\b/.test(msgLower);
  const tieneRuta = msgLower.includes('desde') && (msgLower.includes('a ') || msgLower.includes('hasta '));
  if (tieneToneladas && tieneRuta) return true;
  return simulationKeywords.some(keyword => msgLower.includes(keyword));
}

// --- 2. SELECTOR DE ENDPOINT ---
function getDataBridgeAssistantEndpoint(isSimulation = true) {
  if (isSimulation) {
    const runtimeEndpoint = String(window.SeaCharterDataBridgeAIEndpoint || "").trim();
    const buildEndpoint = String(import.meta.env?.VITE_DATA_BRIDGE_AI_URL || "").trim();
    return runtimeEndpoint || buildEndpoint || "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/cerebro-ia";
  }
  return "https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/chat-assistant";
}

// --- 3. FUNCIÓN DE LLAMADA ACTUALIZADA ---
async function requestAssistantResponse(userText, historyElement, signal) {
  const historial = collectConversationHistory(historyElement);
  
  const requestPayload = {
    CalculationData: collectCalculationData(),
    MarketData: collectMarketData(),
    UserContext: userText,
    ConversationHistory: historial,
  };
  
  const sanitizedPayload = sanitizePayloadForAI(requestPayload);
  
  // Añadimos el contexto de la pantalla y el mensaje original para chat-assistant
  sanitizedPayload.contexto = collectChatContext();
  sanitizedPayload.mensaje = userText;

  // Enrutador Inteligente
  const isSimulation = isSimulationQuery(userText);
  const endpointUrl = getDataBridgeAssistantEndpoint(isSimulation);
  
  console.log(`🤖 [Enrutador AI] Enviando a: ${isSimulation ? 'CEREBRO-IA (Cálculos)' : 'CHAT-ASSISTANT (Consultas)'}`);

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizedPayload),
    signal,
  });
  
  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = responseText;
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || "No pude conectar con el asistente en este momento.");
  }
  return normalizeDataBridgeAssistantResponse(payload);
}

// --- 4. SE MANTIENE TU FUNCIÓN ORIGINAL INTACTA ---
function normalizeDataBridgeAssistantResponse(payload) {
  const candidates = [
    payload?.informe,
    payload?.reply,
    payload?.message,
    payload?.respuesta,
    payload?.response,
    payload?.answer,
    payload?.content,
    payload?.result,
    payload?.data?.informe,
    payload?.data?.reply,
    payload?.data?.message,
    payload?.data?.respuesta,
    payload?.data?.response,
    payload?.data?.answer,
    payload?.data?.content,
    payload?.data?.result,
    typeof payload === "string" ? payload : null,
  ];
  const respuesta = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  if (!respuesta) throw new Error("Data Bridge no devolvió una respuesta analítica para el chat.");
  const rawAction = payload?.action ?? payload?.data?.action ?? null;
  const actionPayload = payload?.payload ?? payload?.data?.payload ?? null;
  return {
    success: true,
    respuesta,
    action: typeof rawAction === "string"
      ? { action: rawAction, payload: actionPayload || {} }
      : rawAction,
  };
}

const ACTIONABLE_AI_JSON_BLOCK = /```json\s*(\{[\s\S]*?\})\s*```/i;
const processedUpdateFieldsActions = new WeakSet();
let updateFieldsActionInProgress = false;
const ACTIONABLE_AI_FIELD_IDS = Object.freeze({
  pol_rate: "rate-load",
  rate_pol: "rate-load",
  loading_rate: "rate-load",
  load_rate: "rate-load",
  ritmo_carga: "rate-load",
  pod_rate: "rate-disch",
  rate_pod: "rate-disch",
  discharge_rate: "rate-disch",
  disch_rate: "rate-disch",
  ritmo_descarga: "rate-disch",
  freight_rate: "freight-rate",
  cargo_qty: "cargo-qty",
  cargo_quantity: "cargo-qty",
  sea_bunker_price: "price-sea",
  port_bunker_price: "price-port",
  owner_margin: "margin-owner",
  charterer_margin: "margin-charterer",
  commission_percent: "commission-pct",
});

function normalizeActionFieldName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findActionableAiJsonObject(responseText) {
  const text = String(responseText || "");
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const character = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "{") depth += 1;
      if (character !== "}") continue;

      depth -= 1;
      if (depth !== 0) continue;
      const rawJson = text.slice(start, end + 1);
      try {
        const parsed = JSON.parse(rawJson);
        if (["update_field", "calculate_route", "fill_complete_form", "update_fields", "search_vessel"].includes(parsed?.action)) {
          return { action: parsed, start, end: end + 1 };
        }
      } catch {}
      break;
    }
  }
  return null;
}

function extractActionableAiResponse(responseText) {
  const originalText = String(responseText || "");
  const jsonBlock = originalText.match(ACTIONABLE_AI_JSON_BLOCK);
  if (jsonBlock) {
    try {
      const action = JSON.parse(jsonBlock[1]);
      if (["update_field", "calculate_route", "fill_complete_form", "update_fields", "search_vessel"].includes(action?.action)) {
        return {
          visibleText: originalText.replace(jsonBlock[0], "").trim(),
          action,
        };
      }
    } catch {}
  }

  const inlineJson = findActionableAiJsonObject(originalText);
  if (!inlineJson) return { visibleText: originalText, action: null };

  return {
    visibleText: `${originalText.slice(0, inlineJson.start)}${originalText.slice(inlineJson.end)}`.trim(),
    action: inlineJson.action,
  };
}

function findActionableAiField(fieldName) {
  const normalizedField = normalizeActionFieldName(fieldName);
  const mappedId = ACTIONABLE_AI_FIELD_IDS[normalizedField];
  if (mappedId) return document.getElementById(mappedId);

  const normalizedId = normalizedField.replace(/_/g, "-");
  const directMatch = document.getElementById(normalizedId);
  if (directMatch) return directMatch;

  return Array.from(document.querySelectorAll("input, select, textarea")).find((element) => (
    [element.id, element.getAttribute("name"), element.dataset.field]
      .some((candidate) => normalizeActionFieldName(candidate) === normalizedField)
  )) || null;
}

function executeActionableAiUpdate(action) {
  if (action?.action !== "update_field") return false;
  const numericValue = Number(action.value);
  if (!Number.isFinite(numericValue)) return false;

  const field = findActionableAiField(action.field);
  if (!field) return false;

  if (field.id === "rate-load" || field.id === "rate-disch") {
    const side = field.id === "rate-disch" ? "pod" : "pol";
    window.setRitmoMode?.("manual", side, { commit: true, deferCalculations: true });
    field.readOnly = false;
    field.disabled = false;
    field.removeAttribute("readonly");
    field.removeAttribute("disabled");
    field.dataset.manualOverride = "true";
    field.dataset.draftCalcMode = "manual";
    if (side === "pod") field.dataset.podCalcMode = "manual";
  }

  field.value = String(numericValue);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  if (field.id === "rate-load" || field.id === "rate-disch") window.recalcularDiasPuerto?.();
  window.runEngine?.();
  window.dispatchEvent(new CustomEvent("sea-assistant:field-updated", {
    detail: { field: normalizeActionFieldName(action.field), value: numericValue, inputId: field.id },
  }));
  return true;
}

async function executeActionableAiUpdateFields(actionObj) {
    // 1. Verificación robusta: Asegurarse de que actionObj existe.
    if (!actionObj) {
        console.warn("executeActionableAiUpdateFields: Se recibió un actionObj nulo o indefinido.");
        return false;
    }

    // 2. Extracción del Payload (La Llave Maestra):
    // El servidor puede enviar { action: "...", payload: {...} } 
    // o simplemente enviar el payload directamente si hubo algún parseo intermedio.
    let p = actionObj.payload || actionObj; 
    
    // 3. Verificación del Payload: Si el payload está vacío (por ejemplo, es un string vacío), abortamos.
    if (!p || typeof p !== 'object' || Object.keys(p).length === 0) {
        console.warn("executeActionableAiUpdateFields: Payload vacío o inválido.", actionObj);
        return false;
    }

    const updateInputs = (ids, value, dispatchEvents = true) => {
        if (value === undefined || value === null || value === "") return;
        
        ids.forEach((id) => {
            const elements = document.querySelectorAll(`#${id}, [name="${id}"], .${id}`);
            
            elements.forEach((input) => {
                if (input.tagName === 'SELECT') {
                    // Búsqueda inteligente en desplegables por texto o valor parcial
                    let matched = false;
                    const valStr = String(value).toLowerCase();
                    for (let option of input.options) {
                        if (option.value.toLowerCase() === valStr || option.text.toLowerCase().includes(valStr)) {
                            input.value = option.value;
                            matched = true;
                            break;
                        }
                    }
                    if (!matched && input.options.length > 0) {
                        input.selectedIndex = 0; // fallback seguro
                    }
                } else {
                    input.value = String(value);
                }

                if (!dispatchEvents) return;
                
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                input.dispatchEvent(new Event("blur", { bubbles: true }));
            });
        });
    };

    // 4. Inyección de datos
    updateInputs(["map-port-pol", "port-pol"], p.pol, false);
    updateInputs(["map-port-pod", "port-pod"], p.pod, false);
    updateInputs(["cargo-qty", "cargo-quantity", "cargo-tonnage"], p.tonnage);
    updateInputs(["map-laycan-date", "match-laycan-start", "gc-laycan-date"], p.laydayStart);
    updateInputs(["map-cancelling-date", "match-laycan-end", "gc-cancel-date"], p.cancelling);
    updateInputs(["cargo-type", "nlp-cargo-category", "input-categoria"], p.category);
    updateInputs(["cargo-product", "nlp-cargo-product", "input-producto", "producto-especifico", "product-select", "input-product"], p.product);
    updateInputs(["rate-load", "loading-rate", "gc-laytime-load-val", "load-rate"], p.loadingRate);
    updateInputs(["rate-disch", "discharge-rate", "gc-laytime-disch-val"], p.dischargeRate);
    updateInputs(["metodo_carga"], p.loadingMethod);
    updateInputs(["metodo_descarga_pod"], p.dischargeMethod ?? p.loadingMethod);

    // 1. Forzar modo MANUAL de forma agresiva en todos los selectores de ritmo
    document.querySelectorAll('button, span, label, div').forEach(el => {
        const txt = el.textContent.trim().toLowerCase();
        if (txt === 'manual' || txt === 'auto / manual') el.click();
    });
    document.querySelectorAll('[data-rate-mode="manual"], #btn-rate-load-manual, #btn-rate-disch-manual, .rate-mode-manual, button[id*="manual"]')?.forEach(btn => btn.click());

    // 2. Inyectar ritmos de carga y descarga asegurando el valor numérico exacto
    updateInputs(["rate-load", "loading-rate", "gc-laytime-load-val", "load-rate"], p.loadingRate);
    updateInputs(["rate-disch", "discharge-rate", "gc-laytime-disch-val", "dischargeRate"], p.dischargeRate);

    // 3. Selección inteligente del Método de Carga (Priorizando Grúa Barco)
    document.querySelectorAll('button, .btn-pill, .pill-option, [role="button"]').forEach(btn => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('big bags') && text.includes('grúa barco')) {
            btn.click();
        }
    });

    // 4. Calcular DWT estimado si viene a 0
    const estimatedDwt = (p.target_dwt && p.target_dwt > 0) ? p.target_dwt : Math.round(Number(p.tonnage || 10000) * 1.05);
    updateInputs(["target-dwt", "cargo-dwt", "vessel-dwt", "input-dwt", "dwt-capacity"], estimatedDwt);

    // 5. Mapear Producto Específico (Priorizando "Big Bags" antes que términos genéricos)
    document.querySelectorAll('select').forEach(sel => {
        const prodText = (p.product || 'big bags').toLowerCase();
        let matched = false;
        
        // Primero buscamos coincidencia exacta con el producto (Big Bags)
        for (let opt of sel.options) {
            if (opt.text.toLowerCase().includes(prodText) || opt.value.toLowerCase().includes(prodText)) {
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                matched = true;
                break;
            }
        }
        
        // Si no, buscamos cemento (excluyendo granel si buscábamos big bags)
        if (!matched) {
            for (let opt of sel.options) {
                if (opt.text.toLowerCase().includes('cemento') && !opt.text.toLowerCase().includes('granel')) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        }
    });

    // 6. Mapear Especificación de Carga para Cemento (Código 10)
    document.querySelectorAll('select').forEach(sel => {
        for (let opt of sel.options) {
            if (opt.text.toLowerCase().includes('cemento') || opt.value === '10') {
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
    });

    // 5. Autocompletado del estado global y disparo del cálculo (tu código original)
    if (p.pol && p.pod && p.tonnage) {
        if (!window.State) window.State = {};
        Object.assign(window.State, {
            pol: p.pol,
            pod: p.pod,
            tonnage: p.tonnage,
        });
        const routeButton = document.getElementById("btn-map-locate-route");
        if (typeof window.runOnDemandMapRouteWorkflow === "function") {
            await window.runOnDemandMapRouteWorkflow(routeButton);
        } else {
            routeButton?.click();
        }
    }

    if (p.loadingRate || p.dischargeRate) {
        window.recalcularDiasPuerto?.();
    }
    
    window.runEngine?.();
    return true;
}

async function executeActionableAiSearchVessel(action) {
  if (action?.action !== "search_vessel") return false;
  document.getElementById("btn-sync-neon-matching")?.click();
  return true;
}

function setActionableAiInputValue(input, value) {
  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeSelectedWpiPort(result) {
  if (!result) return null;
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const officialLabel = String(result.label || "").trim();
  const name = String(result.placeName || officialLabel.replace(/\s*\([A-Za-z]{2,3}\)\s*$/, "")).trim();
  const countryCode = String(result.countryCode || "").trim().toUpperCase();
  if (!officialLabel || !name || !countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    ...(result.port || {}),
    uuid: String(result.uuid || result.port?.uuid || '').trim(),
    unlocode: String(result.unlocode || result.port?.unlocode || '').trim().toUpperCase(),
    maxOperationalDraftMeters: Number(result.maxOperationalDraftMeters ?? result.port?.maxOperationalDraftMeters) || null,
    name,
    officialLabel,
    countryCode,
    latitude,
    longitude,
    source: "DATALASTIC",
  };
}

async function selectActionableAiWpiRoute(pol, pod) {
  if (typeof window.selectFirstWpiAutocompleteMatch !== "function") {
    throw new Error("La búsqueda de Datalastic todavía no está disponible.");
  }

  const selections = {};
  for (const [role, value, inputIds] of [
    ["pol", pol, ["map-port-pol", "port-pol"]],
    ["pod", pod, ["map-port-pod", "port-pod"]],
  ]) {
    let primaryResult = null;
    for (const inputId of inputIds) {
      const result = await window.selectFirstWpiAutocompleteMatch(inputId, value);
      if (!result) throw new Error(`No hay coincidencias WPI para ${role.toUpperCase()}: ${value}`);
      primaryResult ||= result;
    }
    selections[role] = normalizeSelectedWpiPort(primaryResult);
    if (!selections[role]) throw new Error(`La selección WPI de ${role.toUpperCase()} no contiene coordenadas válidas.`);
  }
  return selections;
}

async function executeActionableAiRoute(action) {
  if (action?.action !== "calculate_route") return false;
  const pol = String(action.pol || "").trim().slice(0, 200);
  const pod = String(action.pod || "").trim().slice(0, 200);
  const tonnage = Number(action.tonnage);
  if (!pol || !pod || !Number.isFinite(tonnage) || tonnage <= 0) return false;

  const mapPolInput = document.getElementById("map-port-pol");
  const mapPodInput = document.getElementById("map-port-pod");
  const cargoInput = document.getElementById("cargo-qty");
  const routeButton = document.getElementById("btn-map-locate-route");
  if (!mapPolInput || !mapPodInput || !cargoInput || !routeButton) return false;

  const selectedPorts = await selectActionableAiWpiRoute(pol, pod);
  const selectedPol = selectedPorts.pol.officialLabel;
  const selectedPod = selectedPorts.pod.officialLabel;

  const routeState = {
    pol: selectedPol,
    pod: selectedPod,
    cargoQty: tonnage,
    cargoQuantity: tonnage,
    quantity: tonnage,
  };
  if (!window.State) window.State = {};
  Object.assign(window.State, routeState);
  window.SeaCharterStore?.set?.(routeState, { force: true, source: "assistant-calculate-route" });
  window.updateGlobalVoyageParams?.(routeState, { source: "assistant-calculate-route" });

  setActionableAiInputValue(cargoInput, tonnage);

  routeButton.click();
  window.dispatchEvent(new CustomEvent("sea-assistant:route-calculation-requested", {
    detail: { pol: selectedPol, pod: selectedPod, tonnage },
  }));
  return true;
}

async function executeActionableAiCompleteForm(action) {
  if (action?.action !== "fill_complete_form") return false;
  const pol = String(action.pol || "").trim();
  const pod = String(action.pod || "").trim();
  const tonnage = Number(action.tonnage);
  if (!pol || !pod || !Number.isFinite(tonnage) || tonnage <= 0) return false;
  if (typeof window.applyAssistantCompleteForm !== "function") return false;

  const selectedPorts = await selectActionableAiWpiRoute(pol, pod);
  const validatedAction = {
    ...action,
    pol: selectedPorts.pol.officialLabel,
    pod: selectedPorts.pod.officialLabel,
    pol_port: selectedPorts.pol,
    pod_port: selectedPorts.pod,
  };
  await window.applyAssistantCompleteForm(validatedAction);
  window.dispatchEvent(new CustomEvent("sea-assistant:complete-form-requested", {
    detail: { pol: validatedAction.pol, pod: validatedAction.pod, tonnage },
  }));
  return true;
}

async function executeActionableAiAction(actionObj) {
    // 1. CHIVATO GIGANTE EN CONSOLA para ver qué llega realmente
    console.log("🤖 [MOTOR AI] Datos crudos recibidos del servidor:", actionObj);
    
    if (!actionObj) return false;

    // 2. Extraer la acción, venga en el formato que venga
    const actionName = actionObj.action || actionObj.intent || actionObj.type || actionObj.name;
    
    // 3. La inyección múltiple pertenece exclusivamente a update_fields.
    if (actionName === "update_fields") {
        if (updateFieldsActionInProgress || processedUpdateFieldsActions.has(actionObj)) return false;
        processedUpdateFieldsActions.add(actionObj);
        updateFieldsActionInProgress = true;
        console.log("🚀 [MOTOR AI] Acción reconocida. Disparando inyección de campos...");
        try {
            return await executeActionableAiUpdateFields(actionObj);
        } finally {
            updateFieldsActionInProgress = false;
        }
    }

    if (actionName === "search_vessel") return executeActionableAiSearchVessel(actionObj);
    if (actionName === "fill_complete_form") return executeActionableAiCompleteForm(actionObj);
    if (actionName === "calculate_route") return executeActionableAiRoute(actionObj);
    
    console.warn("⚠️ [MOTOR AI] Acción descartada o redirigida al motor antiguo:", actionName);
    return executeActionableAiUpdate(actionObj);
}

function createVoyageActionCard(scenario) {
  const isPartial = scenario.is_partial || scenario.defaults_applied?.length > 0;
  const safePol = DOMPurify.sanitize(scenario.pol);
  const safePod = DOMPurify.sanitize(scenario.pod);
  const card = document.createElement("article");
  card.className = "sca-voyage-action";
  card.innerHTML = `
    <div class="sca-voyage-action__eyebrow"><span aria-hidden="true">⚡</span> Motor NLP listo</div>
    <p>${isPartial
      ? `He detectado tu ruta (<strong>${safePol} ➔ ${safePod}</strong>). ¿Quieres inyectarla ya en el motor para ver la ruta preliminar y calculamos el resto después?`
      : `He extraído los datos de tu ruta (<strong>POL: ${safePol}</strong>, <strong>POD: ${safePod}</strong>, <strong>Cantidad: ${scenario.cargo_qty.toLocaleString("es-ES")} MT</strong>). ¿Quieres que los inyecte automáticamente en el Motor NLP para calcular la ruta y los costes?`}</p>
    <dl class="sca-voyage-action__details">
      ${scenario.cargo_type && scenario.cargo_type !== "TBA" ? `<div><dt>Carga</dt><dd>${DOMPurify.sanitize(scenario.cargo_type)}</dd></div>` : ""}
      ${scenario.laydays ? `<div><dt>Laycan</dt><dd>${DOMPurify.sanitize(scenario.laydays === scenario.cancelling ? scenario.laydays : `${scenario.laydays} / ${scenario.cancelling}`)}</dd></div>` : ""}
    </dl>
    ${scenario.port_validation?.clarification ? `<p class="sca-voyage-action__warning"><span aria-hidden="true">⚠</span> ${DOMPurify.sanitize(scenario.port_validation.clarification)}</p>` : ""}
    <button type="button" class="sca-voyage-action__button">${scenario.port_validation?.valid ? (isPartial ? "Inyectar ruta preliminar" : "Sí, inyectar y calcular") : "Inyectar datos y revisar puertos"}</button>
    <p class="sca-voyage-action__status" role="status" aria-live="polite"></p>`;

  const button = card.querySelector(".sca-voyage-action__button");
  const status = card.querySelector(".sca-voyage-action__status");
  button.addEventListener("click", async () => {
    if (typeof window.injectVoyageScenario !== "function") {
      status.textContent = "El motor de viaje todavía no está disponible.";
      card.classList.add("is-error");
      return;
    }
    button.disabled = true;
    try {
      const selectedPorts = await selectActionableAiWpiRoute(scenario.pol, scenario.pod);
      const validatedScenario = {
        ...scenario,
        pol: selectedPorts.pol.officialLabel,
        pod: selectedPorts.pod.officialLabel,
        pol_port: selectedPorts.pol,
        pod_port: selectedPorts.pod,
      };
      const result = window.injectVoyageScenario(validatedScenario);
      card.classList.add("is-injected");
      button.textContent = result?.requiresPortSelection
        ? "Datos inyectados · selección pendiente"
        : result?.routeOnly
          ? "Ruta preliminar en cálculo"
          : "Datos inyectados · cálculo iniciado";
      status.textContent = result?.requiresPortSelection
        ? "DraftVoyage actualizado. Selecciona el puerto correcto en los desplegables resaltados."
        : result?.routeOnly
          ? "Ruta y fallbacks seguros inyectados. Los datos operativos pueden completarse después."
          : "DraftVoyage y módulos operativos actualizados correctamente.";
    } catch {
      button.disabled = false;
      card.classList.add("is-error");
      status.textContent = "No se pudieron inyectar los datos. Revisa los campos e inténtalo de nuevo.";
    }
  });
  return card;
}

function createCalculatorAutofillActionCard(action) {
  const cargoQuantity = Number(action.cargo_qty) || 0;
  const requiredDwt = Number(action.dwt ?? action.required_dwt) || 0;
  const loadingRate = Number(action.ratePOL ?? action.loading_rate) || 0;
  const dischargeRate = Number(action.ratePOD ?? action.discharge_rate) || 0;
  const cargoType = String(action.cargo_type || "Carga").trim();
  const vesselClass = String(action.vessel_class || "Buque estándar").trim();
  const loadingMethodLabel = String(action.loading_method?.label || action.methodPOL || "").trim();
  const dischargeMethodLabel = String(action.discharge_method?.label || action.methodPOD || "").trim();
  const methodSummary = String(action.method_summary || action.loading_method?.family || loadingMethodLabel || "método recomendado").trim();
  const summary = `He registrado los ritmos (${loadingRate.toLocaleString("es-ES")} TM/día carga, ${dischargeRate.toLocaleString("es-ES")} TM/día descarga). Para tus ${cargoQuantity.toLocaleString("es-ES")} MT de ${cargoType}, he calculado que necesitas un buque ${vesselClass} de al menos ${requiredDwt.toLocaleString("es-ES")} DWT, y sugiero operar con ${methodSummary}.`;
  const card = document.createElement("article");
  card.className = "sca-voyage-action sca-calculator-action";
  card.dataset.role = "assistant";
  card.dataset.messageText = `${summary} ¿Configuramos todos estos parámetros en la calculadora de una vez?`;
  card.innerHTML = `
    <div class="sca-voyage-action__eyebrow">Autocompletado deductivo</div>
    <p>${DOMPurify.sanitize(summary)}</p>
    <p class="sca-calculator-action__question">¿Configuramos todos estos parámetros en la calculadora de una vez?</p>
    <dl class="sca-voyage-action__details">
      <div><dt>POL</dt><dd>${loadingRate.toLocaleString("es-ES")} TM/día · ${DOMPurify.sanitize(loadingMethodLabel)}</dd></div>
      <div><dt>POD</dt><dd>${dischargeRate.toLocaleString("es-ES")} TM/día · ${DOMPurify.sanitize(dischargeMethodLabel)}</dd></div>
      <div><dt>Buque</dt><dd>${DOMPurify.sanitize(vesselClass)} · ${requiredDwt.toLocaleString("es-ES")} DWT</dd></div>
    </dl>
    <button type="button" class="sca-voyage-action__button">⚡ Autocompletar: Ritmos, Grúas y Buque</button>
    <p class="sca-voyage-action__status" role="status" aria-live="polite"></p>`;

  const button = card.querySelector(".sca-voyage-action__button");
  const status = card.querySelector(".sca-voyage-action__status");
  button.addEventListener("click", () => {
    if (typeof window.applyAssistantCalculatorAutofill !== "function") {
      status.textContent = "La Calculadora todavía no está disponible.";
      card.classList.add("is-error");
      return;
    }
    button.disabled = true;
    try {
      const autofillEvent = new CustomEvent("sea-assistant:calculator-autofill", {
        detail: { payload: action, result: null },
      });
      window.dispatchEvent(autofillEvent);
      const result = autofillEvent.detail.result;
      if (!result?.applied) throw new Error("Calculator autofill was not handled");
      card.classList.add("is-injected");
      button.textContent = "Parámetros aplicados en bloque";
      status.textContent = result?.cargoPreserved
        ? "Ritmos, métodos, DWT y clase actualizados; se conservó la carga ya indicada."
        : "Carga, ritmos, métodos, DWT y clase actualizados simultáneamente.";
    } catch {
      button.disabled = false;
      card.classList.add("is-error");
      status.textContent = "No se pudieron aplicar los parámetros. Revisa la Calculadora e inténtalo de nuevo.";
    }
  });
  return card;
}

function formatTime() {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function readElementValue(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (!element) continue;
    const value = "value" in element ? element.value : element.textContent;
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function firstText(...values) {
  return values
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "";
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const match = String(value).match(/-?\d[\d,.]*/);
    if (!match) continue;
    const number = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function toSerializableSnapshot(value) {
  const visited = new WeakSet();
  const serialized = JSON.stringify(value, (_key, entry) => {
    if (typeof entry === "function" || typeof entry === "symbol") return undefined;
    if (!entry || typeof entry !== "object") return entry;
    if (entry instanceof Date) return entry.toISOString();
    if (typeof File !== "undefined" && entry instanceof File) {
      return { name: entry.name, size: entry.size, type: entry.type, lastModified: entry.lastModified };
    }
    if (visited.has(entry)) return undefined;
    visited.add(entry);
    return entry;
  });
  return serialized ? JSON.parse(serialized) : {};
}

function collectCalculationData() {
  const calculatorState = window.SeaCharterStore?.getState?.() || window.State || {};
  const calculatedState = window.GlobalStore?.calculatedState || window.CalculatedState || {};
  const voyageDraft = window.VoyageDraftStore?.getState?.().draft || {};
  const activeModule = getActiveModuleDescriptor();
  const screenContext = collectChatContext();

  return toSerializableSnapshot({
    generatedAt: new Date().toISOString(),
    activeCalculator: activeModule,
    route: {
      pol: firstText(calculatorState.pol, calculatedState.route?.pol, voyageDraft.pol?.name, readElementValue("port-pol", "map-port-pol")),
      pod: firstText(calculatorState.pod, calculatedState.route?.pod, voyageDraft.pod?.name, readElementValue("port-pod", "map-port-pod")),
      ballastPort: firstText(calculatorState.portBallast, calculatedState.route?.ballastPort, readElementValue("port-ballast", "map-port-ballast")),
      distanceNm: firstNumber(calculatorState.totalMiles, calculatedState.totalDistance, calculatedState.totalDistanceNm, readElementValue("sync-miles-label")),
      laycanStart: firstText(calculatorState.laydays, calculatorState.laycan?.laydays, calculatedState.laycan?.laydays, voyageDraft.laycan?.laydays),
      laycanEnd: firstText(calculatorState.cancelling, calculatorState.laycan?.cancelling, calculatedState.laycan?.cancelling, voyageDraft.laycan?.cancelling),
    },
    cargo: {
      tonnes: firstNumber(calculatorState.cargoQty, calculatorState.cargoQuantity, calculatorState.cargo, calculatedState.cargoQuantity, calculatedState.cargo?.quantity, voyageDraft.cargo?.quantity, readElementValue("cargo-qty", "cargo-quantity", "cargo-tonnage")),
      type: firstText(calculatorState.cargoProduct, calculatorState.cargoType, calculatedState.cargoType, calculatedState.cargo?.typeLabel, voyageDraft.cargo?.product, voyageDraft.cargo?.type, readElementValue("cargo-product", "cargo-type")),
      packaging: firstText(calculatorState.packaging, calculatorState.packageType, calculatedState.cargo?.packaging, voyageDraft.cargo?.packaging, readElementValue("cargo-packaging", "packaging-type", "tipo-empaque")),
      stowageFactor: firstNumber(calculatorState.stowageFactor, calculatedState.cargo?.stowageFactor, readElementValue("stowage-factor")),
      tolerancePercent: firstNumber(calculatorState.cargoTolerance, calculatedState.cargo?.tolerance, readElementValue("cargo-tolerance")),
    },
    operations: {
      loadingMethod: firstText(document.getElementById("metodo_carga")?.selectedOptions?.[0]?.textContent, calculatorState.loadMethod),
      dischargeMethod: firstText(document.getElementById("metodo_descarga_pod")?.selectedOptions?.[0]?.textContent, calculatorState.dischargeMethod),
      loadingRateTonnesDay: firstNumber(readElementValue("rate-load", "gc-laytime-load-val"), calculatorState.loadRate, calculatedState.loadRate),
      dischargeRateTonnesDay: firstNumber(readElementValue("rate-disch", "gc-laytime-disch-val"), calculatorState.dischRate, calculatorState.dischargeRate, calculatedState.dischargeRate),
      loadingLaytime: firstText(readElementValue("laytime-load-condition", "gc-laytime-load-cond"), calculatorState.laytimeLoadCondition),
      dischargeLaytime: firstText(readElementValue("laytime-disch-condition", "gc-laytime-disch-cond"), calculatorState.laytimeDischCondition),
      totalDays: firstNumber(calculatorState.totalDays, calculatedState.totalDays, readElementValue("print-total-days")),
      portDays: firstNumber(calculatorState.totalPortDays, calculatedState.totalPortDays, readElementValue("print-port-days")),
      ballastSpeedKnots: firstNumber(calculatorState.spdBallast, readElementValue("speed-ballast")),
      ladenSpeedKnots: firstNumber(calculatorState.spdLaden, readElementValue("speed-laden")),
    },
    commercial: {
      freightBuyUsdTon: firstNumber(calculatorState.freightBuy, calculatedState.freightBuy, readElementValue("freight-buy")),
      freightSellUsdTon: firstNumber(calculatorState.freightSell, calculatedState.freightSell, readElementValue("freight-sell")),
      breakEvenUsdTon: firstNumber(calculatorState.breakEven, calculatedState.breakEven, readElementValue("res-break-even")),
      tceUsdDay: firstNumber(calculatorState.tceOwner, calculatedState.tce, readElementValue("res-tce-label", "print-tce-owner")),
      ownerMarginPercent: firstNumber(calculatorState.marginOwner, readElementValue("margin-owner")),
      chartererMarginPercent: firstNumber(calculatorState.marginCharterer, readElementValue("margin-charterer")),
      commissionPercent: firstNumber(calculatorState.commPct, readElementValue("commission-pct")),
    },
    screenContext,
    calculatorState,
    calculatedState,
    voyageDraft,
  });
}

function collectMarketData() {
  const calculatorState = window.SeaCharterStore?.getState?.() || window.State || {};
  const referenceData = window.SeaCharterMarketReferenceData || {};
  const intelligencePanel = window.SeaCharterMarketIntelligencePanel?.getData?.() || {};
  const aisFreightRates = window.aisMarketFreightRates || {};

  return toSerializableSnapshot({
    generatedAt: new Date().toISOString(),
    bdi: firstNumber(referenceData.bdi, referenceData.BDI, referenceData.bdiIndex, referenceData.bdi_index, readElementValue("baltic-spot-value")),
    bunkers: {
      region: firstText(calculatorState.bunkerRegion, calculatorState.bunkerDetectedRegion),
      vlsfoUsdTon: firstNumber(referenceData.vlsfo, referenceData.VLSFO, referenceData.vlsfoPrice, calculatorState.priceSea, readElementValue("price-sea")),
      ifo380UsdTon: firstNumber(referenceData.ifo380, referenceData.IFO380, referenceData.ifo380Price, calculatorState.priceIfo, readElementValue("price-ifo")),
      mgoUsdTon: firstNumber(referenceData.mgo, referenceData.MGO, referenceData.mgoPrice, calculatorState.pricePort, readElementValue("price-port")),
    },
    carbon: {
      euAllowanceEurTon: firstNumber(referenceData.euCarbonPrice, referenceData.eua, calculatorState.euCarbonPrice, readElementValue("eu-carbon-price")),
      etsRouteFactor: firstNumber(calculatorState.etsRouteFactor),
    },
    freightBenchmarks: intelligencePanel,
    aisFreightRates,
    referenceData,
  });
}

function getActiveModuleDescriptor() {
  if (document.getElementById("tracking-live-overlay")?.classList.contains("is-open")) {
    return { id: "tracking", name: MODULE_LABELS.tracking };
  }
  if (document.getElementById("dual-mode-overlay")) return { id: "dual", name: "MODO DUAL" };

  const activeView = document.querySelector(".view-section.active-block, .view-section.active-flex");
  const moduleId = activeView?.id?.replace(/^view-/, "") || "map";
  return { id: moduleId, name: MODULE_LABELS[moduleId] || moduleId.toUpperCase() };
}

function getActiveModule() {
  return getActiveModuleDescriptor().name;
}

function getDualModeContext() {
  const dualView = document.querySelector("#dual-mode-overlay dual-trading-chartering-view");
  const context = dualView?.getAssistantContext?.();
  return context && typeof context === "object" ? context : null;
}

function getHighlightedClauses(contractType) {
  const prefix = contractType === "ASBATANKVOY" ? "asb" : "gc";
  const container = document.getElementById(`${prefix}-clauses-selector-container`);
  if (!container) return [];

  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .map((checkbox) => {
      const label = container.querySelector(`label[for="${checkbox.id}"]`);
      return String(label?.textContent || "").trim();
    })
    .filter(Boolean);
}

function collectModuleScreenContext(moduleId = getActiveModuleDescriptor().id) {
  const state = window.SeaCharterStore?.getState?.() || window.State || {};
  const calculatedState = window.GlobalStore?.calculatedState || window.CalculatedState || {};
  const voyageDraft = window.VoyageDraftStore?.getState?.().draft || {};
  const trackingState = window.TrackingStore?.getState?.() || {};
  const workflowState = window.HeaderWorkflowStore?.getState?.() || {};
  const basicRiskResult = evaluateBasicRisks(collectBasicRiskContext());
  const pol = firstText(state.pol, voyageDraft.pol?.name, readElementValue("port-pol", "map-port-pol", "sync-pol-label"));
  const pod = firstText(state.pod, voyageDraft.pod?.name, readElementValue("port-pod", "map-port-pod", "sync-pod-label"));
  const distanceNm = firstNumber(
    calculatedState.totalDistance,
    calculatedState.totalDistanceNm,
    window.GlobalStore?.routeResult?.totalDistance,
    trackingState.operationalMetrics?.totalDistanceNm,
    readElementValue("sync-miles-label"),
  );
  const cargoQuantity = firstNumber(
    state.cargoQty,
    state.cargoQuantity,
    state.quantity,
    voyageDraft.cargo?.quantity,
    readElementValue("cargo-qty", "cargo-quantity", "cargo-tonnage", "matching-cargo-quantity"),
  );
  const cargoType = firstText(
    state.cargoProduct,
    state.cargoType,
    voyageDraft.cargo?.type,
    voyageDraft.cargo?.product,
    readElementValue("cargo-product", "cargo-type", "matching-cargo-type"),
  );
  const densityCount = firstNumber(readElementValue("ais-density-count", "buques-count"));
  const matchingResultCount = firstNumber(
    document.getElementById("btn-sync-neon-matching")?.dataset?.matchingResultCount,
    readElementValue("matching-viable-count", "matching-compatible-count"),
  );
  const matchingValidation = document.getElementById("matching-execution-validation");

  return {
    moduleId,
    pol,
    pod,
    distanceNm,
    cargoQuantity,
    cargoType,
    laycanStart: firstText(state.laydays, state.laycan?.laydays, voyageDraft.laycan?.laydays, readElementValue("map-laycan-date", "match-laycan-start", "gc-laycan-date")),
    laycanEnd: firstText(state.cancelling, state.laycan?.cancelling, voyageDraft.laycan?.cancelling, readElementValue("map-cancelling-date", "match-laycan-end", "gc-cancel-date")),
    freightRate: firstNumber(readElementValue("freight-sell", "ais-rate-fair"), state.freightSell, calculatedState.freightSell),
    tce: firstNumber(state.tceOwner, calculatedState.tce, readElementValue("res-tce-label", "print-tce-owner")),
    loadRate: firstNumber(readElementValue("rate-load", "gc-laytime-load-val"), state.loadRate, calculatedState.loadRate),
    dischargeRate: firstNumber(readElementValue("rate-disch", "gc-laytime-disch-val"), state.dischRate, state.dischargeRate, calculatedState.dischRate),
    analysisReady: Boolean(document.querySelector("#view-decisiones [data-analysis-ready='true'], #view-decisiones .dss-results:not([hidden])")),
    hasRisks: basicRiskResult.alerts > 0,
    basicRisks: basicRiskResult.risks,
    hasVessel: Boolean(trackingState.vessel),
    hasContract: Boolean(trackingState.contractPayload || trackingState.referenceValidated),
    positionUpdatedAt: trackingState.operationalMetrics?.aisUpdatedAt || "",
    densityCalculated: densityCount !== null && densityCount >= 0 && readElementValue("ais-density-count", "buques-count") !== "--",
    densityCount,
    supplyCoefficient: firstNumber(readElementValue("ais-supply-coefficient", "coeficiente-oferta")),
    validationMessage: matchingValidation && !matchingValidation.classList.contains("hidden")
      ? firstText(matchingValidation.dataset.missingFields, matchingValidation.textContent)
      : "",
    resultCount: matchingResultCount,
    contractGenerated: Boolean(workflowState.charterPartyGenerated),
    contractAccepted: Boolean(workflowState.contractAccepted),
    contractReference: firstText(workflowState.charterPartyReference, state.contractReference, readElementValue("contract-reference", "audit-contract-reference")),
    auditReportGenerated: Boolean(workflowState.auditReportGenerated),
  };
}

function collectChatContext() {
  const state = window.SeaCharterStore?.getState?.() || window.State || {};
  const calculatedState = window.GlobalStore?.calculatedState || window.CalculatedState || {};
  const voyageDraft = window.VoyageDraftStore?.getState?.().draft || {};
  const roleMode = window.getGlobalViewMode?.() || window.globalViewMode;
  const activeModuleDescriptor = getActiveModuleDescriptor();
  const activeModule = getActiveModule();
  const moduleScreenContext = collectModuleScreenContext(activeModuleDescriptor.id);
  const proactiveEvaluation = evaluateModuleSuggestions(activeModuleDescriptor.id, moduleScreenContext);
  const dualModeContext = getDualModeContext();
  const contractType = firstText(
    activeModule === "EDITOR ASBATANKVOY" ? "ASBATANKVOY" : "",
    activeModule === "EDITOR" ? "GENCON" : "",
    readElementValue("charter-party-standard"),
    state.charterPartyStandard,
    "GENCON",
  ).toUpperCase();
  const cargoQuantity = firstNumber(
    state.cargoQty,
    state.cargoQuantity,
    voyageDraft.cargo?.quantity,
    readElementValue("cargo-qty", "cargo-quantity", "cargo-tonnage"),
  );
  const cargoType = firstText(
    state.cargoProduct,
    state.cargoType,
    voyageDraft.cargo?.type,
    voyageDraft.cargo?.product,
    readElementValue("cargo-product", "cargo-type", "matching-cargo-type"),
  );
  const loadMethodSelect = document.getElementById("metodo_carga");
  const dischargeMethodSelect = document.getElementById("metodo_descarga_pod");
  const weatherSnapshot = voyageDraft.weather && typeof voyageDraft.weather === "object"
    ? voyageDraft.weather
    : null;

  const draftVoyageContext = {
    POL: firstText(state.pol, voyageDraft.pol?.name, readElementValue("port-pol", "map-port-pol")),
    POD: firstText(state.pod, voyageDraft.pod?.name, readElementValue("port-pod", "map-port-pod")),
    cantidadMT: cargoQuantity,
    tipoCarga: cargoType,
    dwt: firstNumber(state.dwt, state.vesselDwt, voyageDraft.vessel?.dwt, readElementValue("vessel-dwt")),
    claseBuque: firstText(state.class, voyageDraft.vessel?.vesselClass, readElementValue("vessel-badge")),
    metodoCargaPOL: firstText(loadMethodSelect?.selectedOptions?.[0]?.textContent, state.loadMethod),
    metodoDescargaPOD: firstText(dischargeMethodSelect?.selectedOptions?.[0]?.textContent, state.dischargeMethod),
  };

  return {
    modulo: activeModule,
    moduloId: activeModuleDescriptor.id,
    rol: roleMode === "charterer" ? "Fletador/Charterer" : "Armador/Shipowner",
    datosModulo: moduleScreenContext,
    sugerenciasProactivas: proactiveEvaluation.issues,
    draftVoyage: draftVoyageContext,
    meteorologia: weatherSnapshot,
    operativos: {
      puertos: {
        POL: firstText(state.pol, voyageDraft.pol?.name, readElementValue("port-pol", "map-port-pol")),
        POD: firstText(state.pod, voyageDraft.pod?.name, readElementValue("port-pod", "map-port-pod")),
        lastre: firstText(state.portBallast, readElementValue("port-ballast", "map-port-ballast")),
      },
      laycan: {
        inicio: firstText(state.laydays, state.laycan?.laydays, voyageDraft.laycan?.laydays, readElementValue("map-laycan-date", "match-laycan-start")),
        fin: firstText(state.cancelling, state.laycan?.cancelling, voyageDraft.laycan?.cancelling, readElementValue("map-cancelling-date", "match-laycan-end")),
      },
      ritmosToneladasDia: {
        carga: firstNumber(readElementValue("rate-load", "gc-laytime-load-val"), state.loadRate, calculatedState.loadRate),
        descarga: firstNumber(readElementValue("rate-disch", "gc-laytime-disch-val"), state.dischRate, state.dischargeRate, calculatedState.dischRate),
      },
      carga: {
        cantidadMT: cargoQuantity,
        tipo: cargoType,
      },
      terminosTiempoPlancha: {
        POL: firstText(readElementValue("laytime-load-condition", "gc-laytime-load-cond"), state.laytimeLoadCondition),
        POD: firstText(readElementValue("laytime-disch-condition", "gc-laytime-disch-cond"), state.laytimeDischCondition),
      },
    },
    financieros: {
      precioFinalUsdPorTonelada: firstNumber(readElementValue("freight-sell"), state.freightSell, state.sugCharterer, calculatedState.freightSell),
      tceUsdDia: firstNumber(state.tceOwner, calculatedState.tce, readElementValue("res-tce-label", "print-tce-owner")),
      margenes: {
        armadorPct: firstNumber(readElementValue("margin-owner"), state.marginOwner),
        fletadorPct: firstNumber(readElementValue("margin-charterer"), state.marginCharterer),
        beneficioArmadorUsd: firstNumber(state.netProfitOwner, calculatedState.netProfitOwner),
        beneficioFletadorUsd: firstNumber(state.netProfitCharterer, calculatedState.netProfitCharterer),
      },
      ...(dualModeContext ? { modoDual: dualModeContext } : {}),
    },
    contrato: {
      tipo: contractType,
      clausulasDestacadas: getHighlightedClauses(contractType),
    },
  };
}

function collectBasicRiskContext() {
  const state = window.SeaCharterStore?.getState?.() || window.State || {};
  const calculatedState = window.GlobalStore?.calculatedState || window.CalculatedState || {};
  const voyageDraft = window.VoyageDraftStore?.getState?.().draft || {};

  return {
    pol: firstText(state.pol, voyageDraft.pol?.name, readElementValue("port-pol", "map-port-pol")),
    pod: firstText(state.pod, voyageDraft.pod?.name, readElementValue("port-pod", "map-port-pod")),
    loadRate: firstNumber(readElementValue("rate-load", "gc-laytime-load-val"), state.loadRate, calculatedState.loadRate),
    dischargeRate: firstNumber(readElementValue("rate-disch", "gc-laytime-disch-val"), state.dischRate, state.dischargeRate, calculatedState.dischRate),
    role: window.getGlobalViewMode?.() || window.globalViewMode,
    loadTerms: firstText(readElementValue("laytime-load-condition", "gc-laytime-load-cond"), state.laytimeLoadCondition),
    dischargeTerms: firstText(readElementValue("laytime-disch-condition", "gc-laytime-disch-cond"), state.laytimeDischCondition),
  };
}

function createAiAlertsStore(toggleButton) {
  const badge = toggleButton.querySelector(".sea-assistant-alert-badge");
  let aiAlerts = 0;

  let currentEvaluation = { moduleId: "map", moduleName: MODULE_LABELS.map, alerts: 0, issues: [] };

  const render = () => {
    const hasAlerts = aiAlerts > 0;
    toggleButton.dataset.aiAlerts = String(aiAlerts);
    toggleButton.classList.toggle("has-ai-alerts", hasAlerts);
    if (badge) {
      badge.hidden = !hasAlerts;
      badge.textContent = hasAlerts ? `💡 ${aiAlerts > 9 ? "9+" : aiAlerts}` : "";
      badge.setAttribute("aria-label", `${aiAlerts} sugerencia${aiAlerts === 1 ? "" : "s"} de riesgo`);
    }
    toggleButton.title = hasAlerts
      ? `💡 Sugerencia disponible en ${currentEvaluation.moduleName}`
      : "Abrir Asistente SeaCharter";
  };

  const setAlerts = (value) => {
    const normalized = Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
    aiAlerts = normalized;
    render();
    window.dispatchEvent(new CustomEvent("seaassistantalertschange", { detail: { aiAlerts } }));
    return aiAlerts;
  };

  const store = {
    get aiAlerts() {
      return aiAlerts;
    },
    getAlerts: () => aiAlerts,
    setAlerts,
    resetAlerts: () => setAlerts(0),
    evaluateBasicRisks: (context) => {
      const result = evaluateBasicRisks(context);
      setAlerts(result.alerts);
      return result;
    },
    evaluateCurrentContext: () => store.evaluateBasicRisks(collectBasicRiskContext()),
    evaluateModule: (moduleId = getActiveModuleDescriptor().id) => {
      const moduleName = MODULE_LABELS[moduleId] || moduleId.toUpperCase();
      const data = collectModuleScreenContext(moduleId);
      const result = evaluateModuleSuggestions(moduleId, data);
      currentEvaluation = { moduleId, moduleName, ...result, data };
      setAlerts(result.alerts);
      return currentEvaluation;
    },
    getCurrentEvaluation: () => currentEvaluation,
  };

  store.evaluateCurrentContext = () => store.evaluateModule();

  render();
  return store;
}

function createProactiveGreeting(moduleName) {
  return `¡Hola! Veo que estás trabajando en la sección de ${moduleName}. ¿Quieres que analicemos si falta algún dato, comprobemos si todo es correcto, o velemos por lo que deberías modificar según tu estrategia comercial?`;
}

function monitorActiveModule(aiAlertsStore, statusElement) {
  let activeModuleId = "";
  let evaluationFrame = 0;

  const evaluateActiveModule = () => {
    evaluationFrame = 0;
    const descriptor = getActiveModuleDescriptor();
    if (!SUPPORTED_MODULES.has(descriptor.id)) return;
    const moduleChanged = descriptor.id !== activeModuleId;
    activeModuleId = descriptor.id;
    const evaluation = aiAlertsStore.evaluateModule(descriptor.id);
    if (statusElement) {
      statusElement.textContent = evaluation.alerts > 0
        ? `💡 Sugerencia en ${descriptor.name}`
        : `Disponible en ${descriptor.name}`;
    }
    if (moduleChanged) {
      window.dispatchEvent(new CustomEvent("seaassistantmodulechange", { detail: evaluation }));
    }
  };

  const scheduleEvaluation = () => {
    if (evaluationFrame) window.cancelAnimationFrame(evaluationFrame);
    evaluationFrame = window.requestAnimationFrame(evaluateActiveModule);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.some(({ target }) => target instanceof Element && (target.matches(".view-section") || target.id === "tracking-live-overlay"))) {
      scheduleEvaluation();
    }
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-module-id]")) scheduleEvaluation();
  }, true);
  document.addEventListener("tracking-live:open", scheduleEvaluation);
  document.addEventListener("tracking-live:close", scheduleEvaluation);
  window.addEventListener("seaassistant:refresh-suggestions", scheduleEvaluation);
  scheduleEvaluation();

  return () => observer.disconnect();
}

function mountSeaAssistant() {
  if (document.querySelector(".sca-root")) return;

  const root = document.createElement("aside");
  root.className = "sca-root";
  root.setAttribute("aria-label", "Asistente inteligente de SeaCharter");
  root.innerHTML = `
    <div class="sca-panel w-[400px] h-[550px] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden" id="sea-assistant-panel" role="dialog" aria-labelledby="sea-assistant-title" hidden>
      <header class="sca-header flex justify-between items-center p-3 border-b bg-white rounded-t-xl">
        <div class="sca-header-main flex items-center gap-2 min-w-0">
          <span class="sca-presence-dot w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" aria-hidden="true"></span>
          <h2 class="sca-title font-bold" id="sea-assistant-title">Asistente IA</h2>
        </div>
        <div class="sca-header-actions flex gap-2 items-center">
          <button class="sca-speech-toggle w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 transition-colors border-0 shrink-0" type="button" aria-label="Activar respuestas por voz" aria-pressed="false" title="Activar voz">${icons.speakerMuted}</button>
          <button class="sca-minimize w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 transition-colors border-0 shrink-0" type="button" aria-label="Minimizar asistente" aria-expanded="true" title="Minimizar asistente">${icons.minimize}</button>
          <button class="sca-close w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 transition-colors border-0 shrink-0" type="button" aria-label="Cerrar asistente" title="Cerrar asistente">${icons.close}</button>
        </div>
      </header>
      <div class="sca-history flex-1 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions text">
        <div class="sca-messages-end" aria-hidden="true"></div>
      </div>
      <form class="sca-form w-full min-h-[70px] p-4 bg-gray-50 border-t flex flex-row items-center gap-3 shrink-0">
        <textarea class="sca-input flex-1 h-10 px-3 border border-gray-300 rounded-lg text-[14px] outline-none" rows="1" maxlength="2000" placeholder="Escribe tu consulta marítima..." aria-label="Mensaje para el asistente" required></textarea>
        <button class="sca-mic w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-[#0e1b2a] text-white hover:bg-gray-800 transition-colors" id="sea-assistant-mic-btn" type="button" aria-label="Iniciar dictado por voz" aria-pressed="false" title="Dictar consulta" hidden>${icons.microphone}</button>
        <button class="sca-stop" type="button" aria-label="Detener respuesta" title="Detener respuesta" hidden>${icons.stop}</button>
        <button class="sca-send w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-[#0e1b2a] text-white hover:bg-gray-800 transition-colors" type="submit" aria-label="Enviar mensaje" disabled>${icons.send}</button>
        <span class="sca-status">Disponible para consultas</span>
        <span class="sca-voice-feedback" role="status" aria-live="polite"></span>
      </form>
    </div>`;

  document.body.appendChild(root);

  const panel = root.querySelector(".sca-panel");
  const header = root.querySelector(".sca-header");
  const history = root.querySelector(".sca-history");
  const form = root.querySelector(".sca-form");
  const input = root.querySelector(".sca-input");
  const micButton = root.querySelector(".sca-mic");
  const speechToggle = root.querySelector(".sca-speech-toggle");
  const stopButton = root.querySelector(".sca-stop");
  const minimizeButton = root.querySelector(".sca-minimize");
  const closeButton = root.querySelector(".sca-close");
  const messagesEndRef = root.querySelector(".sca-messages-end");
  const sendButton = root.querySelector(".sca-send");
  const voiceFeedback = root.querySelector(".sca-voice-feedback");
  const status = root.querySelector(".sca-status");
  const toggleButton = document.querySelector("#sea-assistant-toggle");
  if (!toggleButton) {
    root.remove();
    return;
  }
  const aiAlertsStore = createAiAlertsStore(toggleButton);
  window.SeaAssistantAlerts = aiAlertsStore;
  monitorActiveModule(aiAlertsStore, status);
  let pending = false;
  let isDragging = false;
  let hasCustomPosition = false;
  let position = { x: 0, y: 0 };
  let dragStart = { x: 0, y: 0 };
  let recognition = null;
  const recognitionStateRef = {
    current: {
      isListening: false,
      isStarting: false,
      hadError: false,
      shouldSubmit: false,
    },
  };
  const speechSynthesis = window.speechSynthesis;
  const supportsSpeechSynthesis = Boolean(speechSynthesis && window.SpeechSynthesisUtterance);
  let speechEnabled = false;
  let isSpeaking = false;
  let activeRequestController = null;
  let stoppedByUser = false;

  try {
    speechEnabled = supportsSpeechSynthesis && window.localStorage.getItem(SPEECH_PREFERENCE_KEY) === "true";
  } catch {
    speechEnabled = false;
  }

  const syncStopControl = () => {
    stopButton.hidden = !pending && !isSpeaking;
  };

  const cancelSpeech = () => {
    if (supportsSpeechSynthesis) speechSynthesis.cancel();
    isSpeaking = false;
    syncStopControl();
  };

  const syncSpeechToggle = () => {
    speechToggle.innerHTML = speechEnabled ? icons.speaker : icons.speakerMuted;
    speechToggle.classList.toggle("is-active", speechEnabled);
    speechToggle.setAttribute("aria-pressed", String(speechEnabled));
    speechToggle.setAttribute("aria-label", speechEnabled ? "Desactivar respuestas por voz" : "Activar respuestas por voz");
    speechToggle.title = speechEnabled ? "Silenciar voz" : "Activar voz";
    speechToggle.disabled = !supportsSpeechSynthesis;
    if (!supportsSpeechSynthesis) {
      speechToggle.setAttribute("aria-label", "Síntesis de voz no disponible en este navegador");
      speechToggle.title = "Síntesis de voz no disponible";
    }
  };

  const setSpeechEnabled = (enabled) => {
    speechEnabled = supportsSpeechSynthesis && Boolean(enabled);
    if (!speechEnabled) cancelSpeech();
    try {
      window.localStorage.setItem(SPEECH_PREFERENCE_KEY, String(speechEnabled));
    } catch {}
    syncSpeechToggle();
  };

  const cleanTextForSpeech = (text) => {
    const container = document.createElement("div");
    container.innerHTML = DOMPurify.sanitize(marked.parse(String(text || ""), {
      async: false,
      breaks: true,
      gfm: true,
    }));
    return (container.textContent || "").replace(/\s+/g, " ").trim();
  };

  const speakText = (text) => {
    if (!speechEnabled || !supportsSpeechSynthesis || panel.hidden) return;
    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    const utterance = new window.SpeechSynthesisUtterance(cleanText);
    utterance.lang = "es-ES";
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.onstart = () => {
      isSpeaking = true;
      syncStopControl();
    };
    utterance.onend = () => {
      isSpeaking = false;
      syncStopControl();
    };
    utterance.onerror = utterance.onend;
    speechSynthesis.speak(utterance);
  };

  const appendMessage = (message) => {
    history.insertBefore(message, messagesEndRef);
    return message;
  };

  const createAndSpeakAssistantMessage = (text, options = {}) => {
    const message = createMessage("assistant", text, options);
    appendMessage(message);
    if (!options.error) speakText(text);
    return message;
  };

  const replaceWithAssistantMessage = (target, text, options = {}) => {
    const message = createMessage("assistant", text, options);
    target.replaceWith(message);
    if (!options.error) speakText(text);
    return message;
  };

  syncSpeechToggle();

  const scrollToLatest = () => {
    messagesEndRef.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const messagesObserver = new MutationObserver(scrollToLatest);
  messagesObserver.observe(history, { childList: true, subtree: true });

  const resizeInput = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  };

  const syncSendState = () => {
    sendButton.disabled = pending || !input.value.trim();
  };

  const setListening = (nextListening) => {
    recognitionStateRef.current.isListening = nextListening;
    if (nextListening) recognitionStateRef.current.isStarting = false;
    micButton.classList.toggle("is-listening", nextListening);
    micButton.setAttribute("aria-pressed", String(nextListening));
    micButton.setAttribute("aria-label", nextListening ? "Detener dictado por voz" : "Iniciar dictado por voz");
    micButton.title = nextListening ? "Detener dictado" : "Dictar consulta";
  };

  const stopRecognition = () => {
    if (!recognition) return;
    recognitionStateRef.current.shouldSubmit = false;
    try {
      recognition.stop();
    } catch {
      recognitionStateRef.current.isStarting = false;
      setListening(false);
    }
  };

  const insertTranscript = (transcript) => {
    const spokenText = String(transcript || "").trim();
    if (!spokenText) return;

    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, selectionStart);
    const after = input.value.slice(selectionEnd);
    const leadingSpace = before && !/\s$/.test(before) ? " " : "";
    const trailingSpace = after && !/^\s/.test(after) ? " " : "";
    const insertedText = `${leadingSpace}${spokenText}${trailingSpace}`;
    const nextValue = `${before}${insertedText}${after}`.slice(0, input.maxLength);
    const cursorPosition = Math.min(before.length + leadingSpace.length + spokenText.length, nextValue.length);

    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    input.setSelectionRange(cursorPosition, cursorPosition);
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    micButton.hidden = false;

    recognition.onstart = () => {
      recognitionStateRef.current.hadError = false;
      setListening(true);
      voiceFeedback.textContent = "Escuchando tu consulta marítima.";
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript || "")
        .join(" ");
      insertTranscript(transcript);
      recognitionStateRef.current.shouldSubmit = Boolean(input.value.trim());
      voiceFeedback.textContent = "Dictado transcrito. Enviando consulta.";
    };

    recognition.onerror = (event) => {
      recognitionStateRef.current.hadError = true;
      recognitionStateRef.current.isStarting = false;
      recognitionStateRef.current.shouldSubmit = false;
      setListening(false);
      const errorMessages = {
        "not-allowed": "El navegador no tiene permiso para usar el micrófono.",
        "service-not-allowed": "El reconocimiento de voz está bloqueado en este navegador.",
        "audio-capture": "No se detectó un micrófono disponible.",
        "no-speech": "No se detectó voz. Inténtalo de nuevo.",
        network: "El servicio de reconocimiento de voz no está disponible.",
        aborted: "Dictado cancelado.",
      };
      voiceFeedback.textContent = errorMessages[event.error] || "No se pudo completar el dictado por voz.";
    };

    recognition.onend = () => {
      const shouldSubmit = recognitionStateRef.current.shouldSubmit;
      const hadError = recognitionStateRef.current.hadError;
      recognitionStateRef.current.isStarting = false;
      recognitionStateRef.current.shouldSubmit = false;
      setListening(false);
      if (!hadError && voiceFeedback.textContent === "Escuchando tu consulta marítima.") {
        voiceFeedback.textContent = "Dictado finalizado.";
      }
      if (shouldSubmit && !hadError && !pending && input.value.trim()) {
        window.requestAnimationFrame(() => form.requestSubmit());
      }
    };

    micButton.addEventListener("click", () => {
      if (recognitionStateRef.current.isListening || recognitionStateRef.current.isStarting) {
        stopRecognition();
        return;
      }

      recognitionStateRef.current.hadError = false;
      recognitionStateRef.current.shouldSubmit = false;
      recognitionStateRef.current.isStarting = true;
      try {
        recognition.start();
      } catch {
        recognitionStateRef.current.isStarting = false;
        setListening(false);
        voiceFeedback.textContent = "No se pudo iniciar el dictado. Inténtalo de nuevo.";
      }
    });
  }

  const clampPosition = (x, y) => ({
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - panel.offsetWidth)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - panel.offsetHeight)),
  });

  const applyPosition = () => {
    panel.style.left = `${position.x}px`;
    panel.style.top = `${position.y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  };

  const initializePosition = () => {
    const rect = panel.getBoundingClientRect();
    position = clampPosition(rect.left, rect.top);
    hasCustomPosition = true;
    applyPosition();
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    toggleButton.setAttribute("aria-expanded", String(open));
    toggleButton.setAttribute("aria-label", open ? "Ocultar Asistente SeaCharter" : "Abrir Asistente SeaCharter");
    if (open) {
      panel.classList.remove("is-minimized");
      minimizeButton.setAttribute("aria-expanded", "true");
      minimizeButton.setAttribute("aria-label", "Minimizar asistente");
      minimizeButton.title = "Minimizar asistente";
      if (aiAlertsStore.getAlerts() > 0) {
        const evaluation = aiAlertsStore.getCurrentEvaluation();
        appendMessage(createMessage("assistant", createProactiveGreeting(evaluation.moduleName), { meta: formatTime() }));
        aiAlertsStore.resetAlerts();
      } else if (!history.querySelector(".sca-message")) {
        appendMessage(createMessage(
          "assistant",
          "Hola. Soy el Asistente SeaCharter. Puedo ayudarte con consultas sobre logística marítima, fletamentos y rutas.",
        ));
      }
      requestAnimationFrame(() => {
        if (!hasCustomPosition) initializePosition();
        input.focus();
      });
      scrollToLatest();
    } else {
      if (recognitionStateRef.current.isListening || recognitionStateRef.current.isStarting) stopRecognition();
      cancelSpeech();
      toggleButton.focus();
    }
  };

  const openFromContext = (event) => {
    const prompt = String(event?.detail?.prompt || "").trim();
    setOpen(true);
    if (prompt) {
      input.value = prompt;
      resizeInput();
      syncSendState();
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    }
  };

  const setPending = (nextPending) => {
    pending = nextPending;
    input.disabled = nextPending;
    micButton.disabled = nextPending;
    if (nextPending && (recognitionStateRef.current.isListening || recognitionStateRef.current.isStarting)) stopRecognition();
    syncSendState();
    syncStopControl();
  };

  toggleButton.addEventListener("click", () => setOpen(panel.hidden));
  speechToggle.addEventListener("click", () => setSpeechEnabled(!speechEnabled));
  minimizeButton.addEventListener("click", () => {
    const minimized = panel.classList.toggle("is-minimized");
    minimizeButton.setAttribute("aria-expanded", String(!minimized));
    minimizeButton.setAttribute("aria-label", minimized ? "Restaurar asistente" : "Minimizar asistente");
    minimizeButton.title = minimized ? "Restaurar asistente" : "Minimizar asistente";
    if (minimized && (recognitionStateRef.current.isListening || recognitionStateRef.current.isStarting)) stopRecognition();
    if (!minimized) {
      position = clampPosition(position.x, position.y);
      applyPosition();
      requestAnimationFrame(() => input.focus());
    }
  });
  closeButton.addEventListener("click", () => setOpen(false));
  stopButton.addEventListener("click", () => {
    stoppedByUser = Boolean(activeRequestController);
    activeRequestController?.abort();
    cancelSpeech();
  });
  window.addEventListener("sea-assistant:open", openFromContext);

  header.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;

    if (!hasCustomPosition) initializePosition();
    isDragging = true;
    dragStart = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    panel.classList.add("is-dragging");
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!isDragging) return;

    position = clampPosition(
      event.clientX - dragStart.x,
      event.clientY - dragStart.y,
    );
    applyPosition();
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;

    isDragging = false;
    panel.classList.remove("is-dragging");
  });

  window.addEventListener("resize", () => {
    if (!hasCustomPosition) return;

    position = clampPosition(position.x, position.y);
    applyPosition();
  });

  input.addEventListener("input", () => {
    resizeInput();
    syncSendState();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sendButton.disabled) form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userText = input.value;
    if (!userText.trim() || pending) return;

    cancelSpeech();
    appendMessage(createMessage("user", userText, { meta: formatTime() }));
    input.value = "";
    resizeInput();
    setPending(true);
    const thinkingMessage = createThinkingMessage();
    appendMessage(thinkingMessage);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    activeRequestController = controller;

    try {
      const response = await requestAssistantResponse(userText, history, controller.signal);
      const actionableResponse = extractActionableAiResponse(response.respuesta);
      const action = response.action && typeof response.action === "object"
        ? response.action
        : actionableResponse.action;
      if (action) await executeActionableAiAction(action);
      replaceWithAssistantMessage(
        thinkingMessage,
        actionableResponse.visibleText || "Acción completada.",
        { meta: formatTime() },
      );
    } catch (error) {
      const errorText = error?.name === "AbortError"
        ? (stoppedByUser ? "Respuesta detenida." : "La solicitud tardó demasiado. Inténtalo de nuevo.")
        : (error?.message || "No se pudo consultar al asistente en este momento.");
      thinkingMessage.replaceWith(createMessage("assistant", errorText, { error: true }));
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequestController === controller) activeRequestController = null;
      stoppedByUser = false;
      setPending(false);
      input.focus();
      scrollToLatest();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountSeaAssistant, { once: true });
} else {
  mountSeaAssistant();
}
