import DOMPurify from "dompurify";
import { marked } from "marked";
import { evaluateBasicRisks } from "./basic-risk-evaluator.js";
import { evaluateModuleSuggestions, SUPPORTED_MODULES } from "./universal-module-suggestions.js";

const CHAT_ENDPOINT = "/.netlify/functions/chat-assistant";
const NLP_ENDPOINT = "/api/nlp-voyage-extract";
const REQUEST_TIMEOUT_MS = 45_000;
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
};

function createMessage(role, text, options = {}) {
  const message = document.createElement("article");
  message.className = `sca-message sca-message--${role}${options.error ? " sca-message--error" : ""}`;

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

function normalizeWpiPortRecord(value) {
  if (!value || value.source !== "WPI") return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!value.officialLabel || !value.countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { ...value, latitude, longitude, source: "WPI" };
}

function normalizeVoyageScenario(value = {}, portValidation = {}) {
  return {
    pol: String(value.pol || "").trim(),
    pod: String(value.pod || "").trim(),
    laydays: String(value.laydays || "").trim(),
    cancelling: String(value.cancelling || value.laydays || "").trim(),
    cargo_qty: Number(value.cargo_qty ?? value.cargoQty) || 0,
    cargo_type: String(value.cargo_type || value.cargoType || "").trim(),
    loading_rate: Number(value.loading_rate ?? value.loadingRate) || 0,
    discharge_rate: Number(value.discharge_rate ?? value.dischargeRate) || 0,
    pol_port: normalizeWpiPortRecord(value.pol_port),
    pod_port: normalizeWpiPortRecord(value.pod_port),
    port_validation: {
      valid: portValidation?.valid === true,
      clarification: String(portValidation?.clarification || "").trim(),
    },
  };
}

function hasInjectableVoyage(scenario) {
  return Boolean(
    scenario.port_validation?.valid
    && scenario.pol === scenario.pol_port?.officialLabel
    && scenario.pod === scenario.pod_port?.officialLabel
    && scenario.cargo_qty > 0,
  );
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
  const scenario = normalizeVoyageScenario(payload.scenario, payload.port_validation);
  return {
    scenario: hasInjectableVoyage(scenario) ? scenario : null,
    clarification: String(payload.port_validation?.clarification || "").trim(),
  };
}

function createVoyageActionCard(scenario) {
  const card = document.createElement("article");
  card.className = "sca-voyage-action";
  card.innerHTML = `
    <div class="sca-voyage-action__eyebrow"><span aria-hidden="true">⚡</span> Motor NLP listo</div>
    <p>He extraído los datos de tu ruta (<strong>POL: ${DOMPurify.sanitize(scenario.pol)}</strong>, <strong>POD: ${DOMPurify.sanitize(scenario.pod)}</strong>, <strong>Cantidad: ${scenario.cargo_qty.toLocaleString("es-ES")} MT</strong>). ¿Quieres que los inyecte automáticamente en el Motor NLP para calcular la ruta y los costes?</p>
    <dl class="sca-voyage-action__details">
      ${scenario.cargo_type ? `<div><dt>Carga</dt><dd>${DOMPurify.sanitize(scenario.cargo_type)}</dd></div>` : ""}
      ${scenario.laydays ? `<div><dt>Laycan</dt><dd>${DOMPurify.sanitize(scenario.laydays === scenario.cancelling ? scenario.laydays : `${scenario.laydays} / ${scenario.cancelling}`)}</dd></div>` : ""}
    </dl>
    <button type="button" class="sca-voyage-action__button">Sí, inyectar y calcular</button>
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
      window.injectVoyageScenario(scenario);
      card.classList.add("is-injected");
      button.textContent = "Datos inyectados · cálculo iniciado";
      status.textContent = "DraftVoyage y módulos operativos actualizados correctamente.";
    } catch {
      button.disabled = false;
      card.classList.add("is-error");
      status.textContent = "No se pudieron inyectar los datos. Revisa los campos e inténtalo de nuevo.";
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

  return {
    modulo: activeModule,
    moduloId: activeModuleDescriptor.id,
    rol: roleMode === "charterer" ? "Fletador/Charterer" : "Armador/Shipowner",
    datosModulo: moduleScreenContext,
    sugerenciasProactivas: proactiveEvaluation.issues,
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
  let isListening = false;
  let recognitionHadError = false;

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
  window.addEventListener("sea-assistant:open", openFromContext);

  header.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

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

    history.appendChild(createMessage("user", userText, { meta: formatTime() }));
    input.value = "";
    resizeInput();
    setPending(true);

    const thinkingMessage = createThinkingMessage();
    history.appendChild(thinkingMessage);
    scrollToLatest();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const contexto = collectChatContext();
      const chatRequest = fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: userText, contexto }),
        signal: controller.signal,
      });
      const extractionRequest = extractVoyageScenario(userText, controller.signal).catch(() => null);
      const [response, voyageExtraction] = await Promise.all([chatRequest, extractionRequest]);

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || typeof payload.respuesta !== "string") {
        throw new Error("Invalid assistant response");
      }

      thinkingMessage.replaceWith(createMessage("assistant", payload.respuesta.trim(), { meta: formatTime() }));
      if (voyageExtraction?.scenario) {
        history.appendChild(createVoyageActionCard(voyageExtraction.scenario));
      } else if (voyageExtraction?.clarification) {
        history.appendChild(createMessage("assistant", voyageExtraction.clarification, { meta: "Validación WPI" }));
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
