import DOMPurify from "dompurify";
import { validateScenarioPortsWithWpi } from "./wpi-catalog-client.js";
import {
  applyVoyageScenarioDefaults,
  hasMinimumVoyageRoute,
} from "../shared/voyage-scenario-policy.mjs";
import { marked } from "marked";
import { evaluateBasicRisks } from "./basic-risk-evaluator.js";
import { evaluateModuleSuggestions, SUPPORTED_MODULES } from "./universal-module-suggestions.js";

const CHAT_ENDPOINT = "/.netlify/functions/chat-assistant";
const NLP_ENDPOINT = "/api/nlp-voyage-extract";
const REQUEST_TIMEOUT_MS = 45_000;
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
};

function createMessage(role, text, options = {}) {
  const message = document.createElement("article");
  message.className = `sca-message sca-message--${role}${options.error ? " sca-message--error" : ""}`;
  message.dataset.role = role;
  message.dataset.messageText = String(text || "");

  const bubble = document.createElement("div");
  bubble.className = "sca-bubble";
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

function createThinkingMessage() {
  const message = document.createElement("article");
  message.className = "sca-message sca-message--assistant";
  message.dataset.thinking = "true";
  message.innerHTML = `
    <div class="sca-bubble sca-thinking" role="status">
      <span>El asistente está pensando</span>
      <span class="sca-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
    </div>`;
  return message;
}

function normalizeVoyageScenario(value = {}) {
  return applyVoyageScenarioDefaults({
    ...value,
    pol: String(value.pol || "").trim(),
    pod: String(value.pod || "").trim(),
    laydays: String(value.laydays || "").trim(),
    cancelling: String(value.cancelling || "").trim(),
    cargo_qty: Number(value.cargo_qty ?? value.cargoQty) || 0,
    cargo_type: String(value.cargo_type || value.cargoType || "").trim(),
    loading_rate: Number(value.loading_rate ?? value.loadingRate) || 0,
    discharge_rate: Number(value.discharge_rate ?? value.dischargeRate) || 0,
  });
}

function hasInjectableVoyage(scenario) {
  return hasMinimumVoyageRoute(scenario);
}

async function extractVoyageScenario(text, signal) {
  const response = await fetch(NLP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) return null;
  const scenario = await validateScenarioPortsWithWpi(normalizeVoyageScenario(payload.scenario));
  return {
    scenario: hasInjectableVoyage(scenario) ? scenario : null,
    clarification: String(scenario.port_validation?.clarification || "").trim(),
  };
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
  button.addEventListener("click", () => {
    if (typeof window.injectVoyageScenario !== "function") {
      status.textContent = "El motor de viaje todavía no está disponible.";
      card.classList.add("is-error");
      return;
    }
    button.disabled = true;
    try {
      const result = window.injectVoyageScenario(scenario);
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
    <div class="sca-panel" id="sea-assistant-panel" role="dialog" aria-labelledby="sea-assistant-title" hidden>
      <header class="sca-header">
        <span class="sca-mark">${icons.assistant}</span>
        <div class="sca-heading">
          <h2 class="sca-title" id="sea-assistant-title">Asistente SeaCharter</h2>
          <p class="sca-status">Disponible para consultas</p>
        </div>
        <button class="sca-speech-toggle" type="button" aria-label="Activar respuestas por voz" aria-pressed="false" title="Activar voz">${icons.speakerMuted}</button>
      </header>
      <div class="sca-history" aria-live="polite" aria-relevant="additions text"></div>
      <form class="sca-form">
        <textarea class="sca-input" rows="1" maxlength="2000" placeholder="Escribe tu consulta marítima..." aria-label="Mensaje para el asistente" required></textarea>
        <button class="sca-mic" id="sea-assistant-mic-btn" type="button" aria-label="Iniciar dictado por voz" aria-pressed="false" title="Dictar consulta" hidden>${icons.microphone}</button>
        <button class="sca-send" type="submit" aria-label="Enviar mensaje" disabled>${icons.send}</button>
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
  let wizardStep = 1;
  const wizardData = {};
  let isDragging = false;
  let hasCustomPosition = false;
  let position = { x: 0, y: 0 };
  let dragStart = { x: 0, y: 0 };
  let recognition = null;
  let isListening = false;
  let recognitionHadError = false;
  const speechSynthesis = window.speechSynthesis;
  const supportsSpeechSynthesis = Boolean(speechSynthesis && window.SpeechSynthesisUtterance);
  let speechEnabled = false;

  try {
    speechEnabled = supportsSpeechSynthesis && window.localStorage.getItem(SPEECH_PREFERENCE_KEY) === "true";
  } catch {
    speechEnabled = false;
  }

  const cancelSpeech = () => {
    if (supportsSpeechSynthesis) speechSynthesis.cancel();
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
    speechSynthesis.speak(utterance);
  };

  const createAndSpeakAssistantMessage = (text, options = {}) => {
    const message = createMessage("assistant", text, options);
    history.appendChild(message);
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
    history.scrollTo({ top: history.scrollHeight, behavior: "smooth" });
  };

  const resizeInput = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  };

  const syncSendState = () => {
    sendButton.disabled = pending || !input.value.trim();
  };

  const setListening = (nextListening) => {
    isListening = nextListening;
    micButton.classList.toggle("is-listening", nextListening);
    micButton.setAttribute("aria-pressed", String(nextListening));
    micButton.setAttribute("aria-label", nextListening ? "Detener dictado por voz" : "Iniciar dictado por voz");
    micButton.title = nextListening ? "Detener dictado" : "Dictar consulta";
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
      recognitionHadError = false;
      setListening(true);
      voiceFeedback.textContent = "Escuchando tu consulta marítima.";
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript || "")
        .join(" ");
      insertTranscript(transcript);
      voiceFeedback.textContent = "Dictado añadido al mensaje.";
    };

    recognition.onerror = (event) => {
      recognitionHadError = true;
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
      setListening(false);
      if (!recognitionHadError && voiceFeedback.textContent === "Escuchando tu consulta marítima.") {
        voiceFeedback.textContent = "Dictado finalizado.";
      }
    };

    micButton.addEventListener("click", () => {
      if (isListening) {
        recognition.stop();
        return;
      }

      recognitionHadError = false;
      try {
        recognition.start();
        setListening(true);
      } catch {
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
      if (aiAlertsStore.getAlerts() > 0) {
        const evaluation = aiAlertsStore.getCurrentEvaluation();
        history.appendChild(createMessage("assistant", createProactiveGreeting(evaluation.moduleName), { meta: formatTime() }));
        aiAlertsStore.resetAlerts();
      } else if (!history.children.length) {
        history.appendChild(createMessage(
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
      if (isListening) recognition?.stop();
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
    if (nextPending && isListening) recognition?.stop();
    syncSendState();
  };

  toggleButton.addEventListener("click", () => setOpen(panel.hidden));
  speechToggle.addEventListener("click", () => setSpeechEnabled(!speechEnabled));
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
    const userText = input.value.trim();
    if (!userText || pending) return;

    cancelSpeech();
    history.appendChild(createMessage("user", userText, { meta: formatTime() }));
    input.value = "";
    resizeInput();

    if (wizardStep === 1) {
      wizardData.routeAndTonnage = userText;
      wizardStep = 2;
      createAndSpeakAssistantMessage("¿Cuál es el formato de la carga?", { meta: formatTime() });
      input.focus();
      return;
    }

    if (wizardStep === 2) {
      wizardData.cargoFormat = userText;
      wizardStep = 3;
      createAndSpeakAssistantMessage("Indica los ritmos de carga y descarga, junto con la maquinaria disponible.", { meta: formatTime() });
      input.focus();
      return;
    }

    if (wizardStep === 3) {
      wizardData.ratesAndMachinery = userText;
      wizardStep = 4;
      createAndSpeakAssistantMessage("¿Cuál es la mercancía exacta?", { meta: formatTime() });
      input.focus();
      return;
    }

    wizardData.exactCargo = userText;
    const wizardPrompt = [
      `Ruta y toneladas: ${wizardData.routeAndTonnage}`,
      `Formato de carga: ${wizardData.cargoFormat}`,
      `Ritmos y maquinaria: ${wizardData.ratesAndMachinery}`,
      `Mercancía exacta: ${wizardData.exactCargo}`,
    ].join("\n");
    setPending(true);

    const thinkingMessage = createThinkingMessage();
    history.appendChild(thinkingMessage);
    scrollToLatest();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const contexto = collectChatContext();
      const historial = collectConversationHistory(history);
      contexto.historialChat = historial;
      const baseRequestPayload = JSON.parse(JSON.stringify({ mensaje: wizardPrompt, contexto }));
      const chatRequest = fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseRequestPayload, historial }),
        signal: controller.signal,
      });
      const extractionRequest = extractVoyageScenario(wizardPrompt, controller.signal).catch(() => null);
      const [response, voyageExtraction] = await Promise.all([chatRequest, extractionRequest]);

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || typeof payload.respuesta !== "string") {
        throw new Error("Invalid assistant response");
      }

      if (payload.action?.type === "calculator_autofill") {
        const actionCard = createCalculatorAutofillActionCard(payload.action);
        thinkingMessage.replaceWith(actionCard);
        speakText(actionCard.dataset.messageText);
      } else {
        replaceWithAssistantMessage(thinkingMessage, payload.respuesta.trim(), { meta: formatTime() });
      }
      if (!payload.action && voyageExtraction?.scenario) {
        history.appendChild(createVoyageActionCard(voyageExtraction.scenario));
      } else if (!payload.action && voyageExtraction?.clarification) {
        createAndSpeakAssistantMessage(voyageExtraction.clarification, { meta: "Validación WPI" });
      }
    } catch (error) {
      const errorText = error?.name === "AbortError"
        ? "La respuesta está tardando más de lo esperado. Inténtalo de nuevo en unos segundos."
        : "No pude conectar con el asistente en este momento. Revisa tu conexión e inténtalo de nuevo.";
      thinkingMessage.replaceWith(createMessage("assistant", errorText, { error: true }));
    } finally {
      window.clearTimeout(timeoutId);
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
