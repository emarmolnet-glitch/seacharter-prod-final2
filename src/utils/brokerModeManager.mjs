/**
 * Broker Mode (Modo Experto) Global State and Listener Manager
 * SeaCharter Core PRO - Frontend React / Asistente Core
 *
 * Implements non-intrusive expert overrides across Modules 1 to 10
 * without modifying calculation formulas or Cerebro.ia backend logic.
 */

export const BROKER_MODE_ACTIVATED_MESSAGE =
  "Modo Broker activado. Si eres profesional y conoces los datos de tus barcos, tales como DWT, GT, LOA, BEAM, AÑO, CONSUMOS DE COMBUSTIBLES, PDA'S, puedes ajustar los parámetros necesarios en cualquier módulo y pulsar el boton 'Validar especificaciones / Calcular' para recalcular el TCE.";

export const BROKER_MODE_APPLIED_FEEDBACK =
  "Modo Broker aplicado con éxito. Delta de margen actualizado.";

// Key input IDs and names across Modules 1 to 10
export const BROKER_MODE_INPUT_IDS = [
  // Módulo 1 (Derrota y Puertos)
  "input-pol",
  "input-pod",
  "sea-distance",

  // Módulo 2 (Especificaciones: Velocidad, Ritmos, IMO, DWT, GT, LOA, BEAM, Año)
  "spd-laden",
  "spd-ballast",
  "speed-laden",
  "speed-ballast",
  "vessel-speed",
  "speed",
  "speedKnots",
  "rate-load",
  "rate-disch",
  "ritmo_nominal_pol",
  "ritmo_nominal_pod",
  "gruas-swl-pol",
  "gruas-swl-pod",
  "gruas-ciclos-pol",
  "gruas-ciclos-pod",
  "vessel-identity-imo",
  "imo",
  "vessel-identity-dwt",
  "vessel-dwt",
  "cargo-qty",
  "vessel-identity-gt",
  "vessel-identity-loa",
  "vessel-loa",
  "vessel-identity-beam",
  "vessel-beam",
  "vessel-identity-year",
  "vessel-year",
  "vessel-identity-flag",

  // Módulo 3 (Estructura de Costes: OPEX Fijo Diario, Consumos VLSFO/MGO, Bunkers, PDAs)
  "opex-daily",
  "opex_fijo_diario",
  "dailyOpex",
  "cons-sea",
  "cons-port",
  "cons-anchorage",
  "cons-anchorage-aux",
  "price-sea",
  "price-ifo",
  "price-port",
  "pda-pol",
  "pda-pod",
  "stevedoring-costs",
  "pda-misc",
  "cargo-surcharge",

  // Módulo 4 (Ajustes Inteligentes: Tiempos de espera, Coste Remolcadores)
  "t-fondeo",
  "t-fondeo-pod",
  "delta-historico",
  "factor-clima",
  "factor-clima-pod",
  "laycan-dias-libres",
  "t-remolcadores",
  "smart-tug-cost",

  // Módulo 7 / 10 (Negociación y overrides manuales)
  "negotiation-owner-offer",
  "negotiation-charterer-target",
  "negotiation-safety-factor",
  "target-margin",
  "coa-num-embarques",
  "coa-total-tm",
  "reverse-tce-target",
  "reverse-tceTarget",
  "cost-plus-daily-opex",
  "cost-plus-target-margin",
];

class BrokerModeManagerClass {
  constructor() {
    this._isBrokerMode = false;
    this._calculoBase = null;
    this._hasBaseCalculation = false;
    this._feedbackMessage = null;
    this._listeners = new Set();
    this._listenersAttached = false;
  }

  get isBrokerMode() {
    return this._isBrokerMode;
  }

  set isBrokerMode(val) {
    this.setIsBrokerMode(val);
  }

  get calculoBase() {
    return this._calculoBase;
  }

  set calculoBase(val) {
    this._calculoBase = val;
  }

  get baseCalculation() {
    return this._calculoBase;
  }

  set baseCalculation(val) {
    this._calculoBase = val;
  }

  get hasBaseCalculation() {
    return this._hasBaseCalculation || (typeof window !== "undefined" && Boolean(window.__hasCerebroBaseCalculation));
  }

  set hasBaseCalculation(val) {
    this.setHasBaseCalculation(val);
  }

  get feedbackMessage() {
    return this._feedbackMessage;
  }

  getIsBrokerMode() {
    return this._isBrokerMode;
  }

  setIsBrokerMode(value, options = {}) {
    const nextVal = Boolean(value);
    if (this._isBrokerMode === nextVal) return;

    this._isBrokerMode = nextVal;

    if (nextVal && !this._calculoBase) {
      this.captureCurrentCalculoBase();
    }

    if (!nextVal) {
      this._feedbackMessage = null;
    }

    this._notifyStateChange();

    if (typeof window !== "undefined") {
      window.isBrokerMode = nextVal;
      try {
        window.dispatchEvent(
          new CustomEvent("broker-mode:state-change", {
            detail: { isBrokerMode: nextVal, calculoBase: this._calculoBase },
          })
        );
      } catch (_) {}
    }
  }

  getCalculoBase() {
    return this._calculoBase;
  }

  setCalculoBase(snapshot) {
    this._calculoBase = snapshot ? { ...snapshot } : null;
    if (typeof window !== "undefined") {
      window.calculoBase = this._calculoBase;
      window.baseCalculation = this._calculoBase;
    }
  }

  getHasBaseCalculation() {
    if (this._hasBaseCalculation) return true;
    if (typeof window !== "undefined") {
      if (window.__hasCerebroBaseCalculation) return true;
      const state = window.State;
      if (state && (Number(state.costeTotal || state.totalCost || state.tce || state.tceCalculado || state.breakEvenFreight) > 0)) {
        return true;
      }
    }
    return false;
  }

  setHasBaseCalculation(val) {
    this._hasBaseCalculation = Boolean(val);
    if (typeof window !== "undefined") {
      window.__hasCerebroBaseCalculation = Boolean(val);
    }
    if (val && !this._calculoBase) {
      this.captureCurrentCalculoBase();
    }
  }

  /**
   * Captures the current snapshot of calculation results as the base ("Cálculo Base").
   */
  captureCurrentCalculoBase() {
    let snapshot = null;
    if (typeof window !== "undefined") {
      const state = window.State || {};
      snapshot = {
        totalCost: Number(state.costeTotal || state.totalCost || 0),
        breakEven: Number(state.breakEvenFreight || state.costeBaseBreakEven || 0),
        tce: Number(state.tce || state.tceCalculado || 0),
        targetMargin: Number(state.targetMargin || state.margenObjetivo || 15),
        voyageDays: Number(state.diasTotales || state.totalDays || 0),
        freightRate: Number(state.fleteSugeridoArmador || state.freightRate || 0),
        timestamp: Date.now(),
        rawState: typeof state === "object" ? { ...state } : null,
      };
    }
    this._calculoBase = snapshot;
    if (typeof window !== "undefined") {
      window.calculoBase = snapshot;
      window.baseCalculation = snapshot;
    }
    return snapshot;
  }

  /**
   * Activates Broker Mode upon user input modification if base calculation exists.
   */
  activateBrokerMode(reason = "user_override") {
    if (this._isBrokerMode) return false;

    // Must have a base calculation result to enter Broker Mode
    if (!this.getHasBaseCalculation()) {
      return false;
    }

    // Capture base calculation if not already stored
    if (!this._calculoBase) {
      this.captureCurrentCalculoBase();
    }

    this._isBrokerMode = true;
    if (typeof window !== "undefined") {
      window.isBrokerMode = true;
    }

    this._notifyStateChange();

    // Display non-intrusive Toast / Banner
    this.showBrokerModeToast();

    // Emit event
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("broker-mode:activated", {
            detail: {
              reason,
              calculoBase: this._calculoBase,
              message: BROKER_MODE_ACTIVATED_MESSAGE,
            },
          })
        );
      } catch (_) {}
    }

    return true;
  }

  /**
   * Displays the non-intrusive Toast or Banner managed by Asistente Core.
   */
  showBrokerModeToast() {
    if (typeof window === "undefined") return;

    // 1. Core PRO toast system
    if (typeof window.showToast === "function") {
      try {
        window.showToast(BROKER_MODE_ACTIVATED_MESSAGE, false, "info");
      } catch (_) {}
    }

    // 2. Banner in Asistente Core / Header
    const banner = document.getElementById("asistente-core-broker-banner");
    if (banner) {
      banner.classList.remove("hidden");
      banner.style.display = "flex";
      const textEl = banner.querySelector(".broker-banner-text") || banner;
      if (textEl && textEl !== banner) {
        textEl.textContent = BROKER_MODE_ACTIVATED_MESSAGE;
      }
    }

    // 3. Asistente Core message integration
    if (typeof window.agregarMensajeAsistente === "function") {
      try {
        window.agregarMensajeAsistente(BROKER_MODE_ACTIVATED_MESSAGE, {
          aiType: "local",
          isBrokerModeNotice: true,
        });
      } catch (_) {}
    }
  }

  /**
   * Displays feedback in the right panel of results (Module 6 or 10) and via Asistente Core.
   */
  notifyBrokerModeApplied(options = {}) {
    this._feedbackMessage = BROKER_MODE_APPLIED_FEEDBACK;

    if (typeof window === "undefined") return;

    // 1. Show in Module 6 (Resumen de Operación) results panel
    const m6Feedback = document.getElementById("broker-mode-results-feedback");
    if (m6Feedback) {
      m6Feedback.classList?.remove?.("hidden");
      m6Feedback.hidden = false;
      if (m6Feedback.style) m6Feedback.style.display = "flex";
      const textSpan = typeof m6Feedback.querySelector === "function"
        ? (m6Feedback.querySelector(".broker-mode-feedback-message") || m6Feedback)
        : m6Feedback;
      if (textSpan) {
        textSpan.textContent = BROKER_MODE_APPLIED_FEEDBACK;
      }
    }

    // 2. Show in Module 10 (Simulador de Negociación) panel
    const m10Feedback = document.getElementById("broker-mode-negotiation-feedback");
    if (m10Feedback) {
      m10Feedback.classList?.remove?.("hidden");
      m10Feedback.hidden = false;
      if (m10Feedback.style) m10Feedback.style.display = "flex";
      const textSpan = typeof m10Feedback.querySelector === "function"
        ? (m10Feedback.querySelector(".broker-mode-feedback-message") || m10Feedback)
        : m10Feedback;
      if (textSpan) {
        textSpan.textContent = BROKER_MODE_APPLIED_FEEDBACK;
      }
    }

    // 3. Show in Asistente Core chat / voice feedback
    if (typeof window.agregarMensajeAsistente === "function") {
      try {
        window.agregarMensajeAsistente(BROKER_MODE_APPLIED_FEEDBACK, {
          aiType: "local",
          isBrokerFeedback: true,
        });
      } catch (_) {}
    }

    // 4. Dispatch event
    try {
      window.dispatchEvent(
        new CustomEvent("broker-mode:applied", {
          detail: {
            message: BROKER_MODE_APPLIED_FEEDBACK,
            calculoBase: this._calculoBase,
            currentResult: window.State || null,
          },
        })
      );
    } catch (_) {}

    this._notifyStateChange();
  }

  /**
   * Evaluates if a DOM event or target represents a key input from Modules 1 to 10.
   */
  isTargetKeyInput(target) {
    if (!target) return false;
    const id = target.id || "";
    const name = target.name || "";

    if (BROKER_MODE_INPUT_IDS.includes(id) || BROKER_MODE_INPUT_IDS.includes(name)) {
      return true;
    }

    // Check data attributes or class names for negotiation/specs
    if (
      target.matches &&
      target.matches(
        "#vessel-identity-meta input, #port-operations-grid input, #historical-risk-panel input, #charterer-negotiation-simulator input"
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Handles user interaction with any input element.
   */
  handleInputInteraction(eventOrTarget) {
    if (typeof window !== "undefined") {
      if (
        window.__AI_INJECTION_IN_PROGRESS__ ||
        window.__IS_PROGRAMMATIC_UPDATE__ ||
        window.updateFieldsActionInProgress
      ) {
        return;
      }
    }

    const target = eventOrTarget?.target || eventOrTarget;
    if (!this.isTargetKeyInput(target)) {
      return;
    }

    // If base calculation exists and broker mode is not active, activate!
    if (this.getHasBaseCalculation() && !this._isBrokerMode) {
      this.activateBrokerMode(target.id || target.name || "input_interaction");
    }
  }

  /**
   * Injects universal listeners across Modules 1 to 10 on document / container.
   */
  attachUniversalInputListeners(root = typeof document !== "undefined" ? document : null) {
    if (!root || typeof root.addEventListener !== "function" || this._listenersAttached) return;
    this._listenersAttached = true;

    const onUserInteraction = (event) => {
      // Ignore untrusted or synthetic events that come from programmatic hydration
      if (event && event.isTrusted === false) return;
      this.handleInputInteraction(event);
    };

    root.addEventListener("change", onUserInteraction, true);
    root.addEventListener("input", onUserInteraction, true);
    root.addEventListener("blur", onUserInteraction, true);
  }

  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notifyStateChange() {
    this._listeners.forEach((fn) => {
      try {
        fn({
          isBrokerMode: this._isBrokerMode,
          calculoBase: this._calculoBase,
          hasBaseCalculation: this.getHasBaseCalculation(),
          feedbackMessage: this._feedbackMessage,
        });
      } catch (_) {}
    });
  }
}

export const BrokerModeManager = new BrokerModeManagerClass();

// Global exposure for seamless access across React, vanilla modules and tests
if (typeof window !== "undefined") {
  window.BrokerModeManager = BrokerModeManager;
  Object.defineProperty(window, "isBrokerMode", {
    configurable: true,
    enumerable: true,
    get: () => BrokerModeManager.getIsBrokerMode(),
    set: (v) => BrokerModeManager.setIsBrokerMode(v),
  });
  window.setIsBrokerMode = (v) => BrokerModeManager.setIsBrokerMode(v);
  window.calculoBase = BrokerModeManager.getCalculoBase();
  window.baseCalculation = BrokerModeManager.getCalculoBase();

  // Attach DOM listeners automatically when running in browser
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        BrokerModeManager.attachUniversalInputListeners(document);
      });
    } else {
      BrokerModeManager.attachUniversalInputListeners(document);
    }
  }
}

export default BrokerModeManager;
