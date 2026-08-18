import DOMPurify from "dompurify";
import { marked } from "marked";
import { evaluateBasicRisks } from "./basic-risk-evaluator.js";

const CHAT_ENDPOINT = "/.netlify/functions/chat-assistant";
const REQUEST_TIMEOUT_MS = 45_000;
const PROACTIVE_RISK_MESSAGE = "¡Hola! He estado revisando los datos que acabas de introducir y he detectado algunas áreas de riesgo que podrían afectar a tu rentabilidad. ¿Quieres que analicemos los términos del puerto o los ritmos de carga?";

const MODULE_LABELS = Object.freeze({
  map: "MAPA",
  estimator: "CALCULADORA",
  decisiones: "DECISIONES",
  ais: "DENSIDAD AIS",
  matching: "COINCIDENCIA",
  gencon: "EDITOR",
  asbatankvoy: "EDITOR ASBATANKVOY",
  auditor: "AUDITORIA",
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
  close: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>`,
  send: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-7-5.8 14-2.8-5.7L4 12Z" />
      <path d="m11.4 13.3 3.5-3.4" />
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

function getActiveModule() {
  if (document.getElementById("dual-mode-overlay")) return "MODO DUAL";

  const activeView = document.querySelector(".view-section.active-block, .view-section.active-flex");
  const moduleId = activeView?.id?.replace(/^view-/, "") || "map";
  return MODULE_LABELS[moduleId] || moduleId.toUpperCase();
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

function collectChatContext() {
  const state = window.SeaCharterStore?.getState?.() || window.State || {};
  const calculatedState = window.GlobalStore?.calculatedState || window.CalculatedState || {};
  const voyageDraft = window.VoyageDraftStore?.getState?.().draft || {};
  const roleMode = window.getGlobalViewMode?.() || window.globalViewMode;
  const activeModule = getActiveModule();
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
    rol: roleMode === "charterer" ? "Fletador/Charterer" : "Armador/Shipowner",
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

  const render = () => {
    const hasAlerts = aiAlerts > 0;
    toggleButton.dataset.aiAlerts = String(aiAlerts);
    toggleButton.classList.toggle("has-ai-alerts", hasAlerts);
    if (badge) {
      badge.hidden = !hasAlerts;
      badge.textContent = aiAlerts > 9 ? "9+" : String(aiAlerts);
      badge.setAttribute("aria-label", `${aiAlerts} sugerencia${aiAlerts === 1 ? "" : "s"} de riesgo`);
    }
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
  };

  render();
  return store;
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
        <button class="sca-close" type="button" aria-label="Cerrar asistente">${icons.close}</button>
      </header>
      <div class="sca-history" aria-live="polite" aria-relevant="additions text"></div>
      <form class="sca-form">
        <textarea class="sca-input" rows="1" maxlength="2000" placeholder="Escribe tu consulta marítima..." aria-label="Mensaje para el asistente" required></textarea>
        <button class="sca-send" type="submit" aria-label="Enviar mensaje" disabled>${icons.send}</button>
      </form>
    </div>`;

  document.body.appendChild(root);

  const panel = root.querySelector(".sca-panel");
  const header = root.querySelector(".sca-header");
  const history = root.querySelector(".sca-history");
  const form = root.querySelector(".sca-form");
  const input = root.querySelector(".sca-input");
  const sendButton = root.querySelector(".sca-send");
  const toggleButton = document.querySelector("#sea-assistant-toggle");
  const closeButton = root.querySelector(".sca-close");
  if (!toggleButton) {
    root.remove();
    return;
  }
  const aiAlertsStore = createAiAlertsStore(toggleButton);
  window.SeaAssistantAlerts = aiAlertsStore;
  let pending = false;
  let isDragging = false;
  let hasCustomPosition = false;
  let position = { x: 0, y: 0 };
  let dragStart = { x: 0, y: 0 };

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
        history.appendChild(createMessage("assistant", PROACTIVE_RISK_MESSAGE, { meta: formatTime() }));
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
    syncSendState();
  };

  toggleButton.addEventListener("click", () => setOpen(panel.hidden));
  window.addEventListener("sea-assistant:open", openFromContext);
  closeButton.addEventListener("mousedown", (event) => event.stopPropagation());
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(false);
  });

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
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      return;
    }

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
      const response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: userText, contexto }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || typeof payload.respuesta !== "string") {
        throw new Error("Invalid assistant response");
      }

      thinkingMessage.replaceWith(createMessage("assistant", payload.respuesta.trim(), { meta: formatTime() }));
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
