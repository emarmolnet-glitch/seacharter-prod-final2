import React, { useEffect, useState, useCallback } from "react";
import {
  agregarMensajeAsistente,
  buildVesselRescueMessage,
  evaluateVesselAvailability,
  isNoVesselsError,
} from "../sea-assistant-entry.js";
import {
  BrokerModeManager,
  BROKER_MODE_ACTIVATED_MESSAGE,
  BROKER_MODE_APPLIED_FEEDBACK,
} from "../utils/brokerModeManager.js";

export {
  agregarMensajeAsistente,
  buildVesselRescueMessage,
  evaluateVesselAvailability,
  isNoVesselsError,
  BrokerModeManager,
  BROKER_MODE_ACTIVATED_MESSAGE,
  BROKER_MODE_APPLIED_FEEDBACK,
};

/**
 * Hook para gestionar el Estado Global del Modo Broker (Modo Experto)
 */
export function useBrokerMode() {
  const [isBrokerMode, setIsBrokerModeState] = useState(() =>
    BrokerModeManager.getIsBrokerMode()
  );
  const [calculoBase, setCalculoBaseState] = useState(() =>
    BrokerModeManager.getCalculoBase()
  );
  const [feedbackMessage, setFeedbackMessage] = useState(() =>
    BrokerModeManager.feedbackMessage
  );

  useEffect(() => {
    const unsubscribe = BrokerModeManager.subscribe((state) => {
      setIsBrokerModeState(state.isBrokerMode);
      setCalculoBaseState(state.calculoBase);
      setFeedbackMessage(state.feedbackMessage);
    });
    return unsubscribe;
  }, []);

  const setIsBrokerMode = useCallback((val) => {
    BrokerModeManager.setIsBrokerMode(val);
  }, []);

  const activateBrokerMode = useCallback((reason) => {
    return BrokerModeManager.activateBrokerMode(reason);
  }, []);

  const notifyBrokerModeApplied = useCallback((options) => {
    return BrokerModeManager.notifyBrokerModeApplied(options);
  }, []);

  return {
    isBrokerMode,
    setIsBrokerMode,
    calculoBase,
    setCalculoBase: BrokerModeManager.setCalculoBase.bind(BrokerModeManager),
    hasBaseCalculation: BrokerModeManager.getHasBaseCalculation(),
    feedbackMessage,
    activateBrokerMode,
    notifyBrokerModeApplied,
    activatedMessage: BROKER_MODE_ACTIVATED_MESSAGE,
    appliedFeedback: BROKER_MODE_APPLIED_FEEDBACK,
  };
}

/**
 * Hook para interactuar con el Asistente Core y el gestor de estado del chat lateral.
 */
export function useAsistenteCore() {
  const [isAvailable, setIsAvailable] = useState(true);
  const brokerMode = useBrokerMode();

  const checkAvailability = useCallback(async (context = {}) => {
    const result = await evaluateVesselAvailability(context);
    const available = result.hasViableVessels !== false && result.status !== "empty";
    setIsAvailable(available);
    if (!available) {
      const msg = buildVesselRescueMessage(context);
      agregarMensajeAsistente(msg);
    }
    return result;
  }, []);

  const triggerTwinVesselRescue = useCallback((context = {}) => {
    const msg = buildVesselRescueMessage(context);
    return agregarMensajeAsistente(msg);
  }, []);

  return {
    isAvailable,
    checkAvailability,
    triggerTwinVesselRescue,
    agregarMensajeAsistente,
    buildVesselRescueMessage,
    // Modo Broker capabilities
    isBrokerMode: brokerMode.isBrokerMode,
    setIsBrokerMode: brokerMode.setIsBrokerMode,
    calculoBase: brokerMode.calculoBase,
    activateBrokerMode: brokerMode.activateBrokerMode,
    notifyBrokerModeApplied: brokerMode.notifyBrokerModeApplied,
    feedbackMessage: brokerMode.feedbackMessage,
  };
}

/**
 * Componente AsistenteCore de React para integración en el layout o panel lateral.
 * Incluye la capa visual de estado y notificación para el Modo Broker.
 */
export default function AsistenteCore({ autoRescue = false, context = {}, onRescueTriggered }) {
  const { checkAvailability } = useAsistenteCore();
  const { isBrokerMode, feedbackMessage } = useBrokerMode();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (autoRescue) {
      checkAvailability(context).then((res) => {
        if (res.hasViableVessels === false && typeof onRescueTriggered === "function") {
          onRescueTriggered(res);
        }
      });
    }
  }, [autoRescue, context, checkAvailability, onRescueTriggered]);

  // Reset banner dismissal whenever broker mode toggles on
  useEffect(() => {
    if (isBrokerMode) {
      setBannerDismissed(false);
    }
  }, [isBrokerMode]);

  return (
    <>
      <div className="asistente-core-react-bridge" data-testid="asistente-core-bridge" style={{ display: "none" }}>
        {/* Puente React para el gestor de estado del Asistente Core */}
      </div>

      {/* Banner discreto gestionado por el Asistente Core (UI No Intrusiva) */}
      {isBrokerMode && !bannerDismissed && (
        <aside
          id="asistente-core-broker-banner"
          data-testid="asistente-core-broker-banner"
          className="fixed top-4 right-4 z-[9990] max-w-lg rounded-xl border border-indigo-400/40 bg-slate-900/95 p-4 text-xs text-slate-100 shadow-2xl backdrop-blur-md transition-all duration-300 animate-fadeIn"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600/30 text-base text-indigo-400">
              🤖
            </div>
            <div className="flex-1 pr-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-indigo-400">
                  Asistente Core
                </span>
                <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[9px] font-bold text-indigo-300">
                  Modo Experto
                </span>
              </div>
              <p className="broker-banner-text text-[11.5px] leading-relaxed text-slate-200">
                {BROKER_MODE_ACTIVATED_MESSAGE}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="text-slate-400 hover:text-white transition p-1"
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* Feedback Local cuando se aplica el recálculo */}
      {feedbackMessage && (
        <div
          id="asistente-core-feedback-toast"
          data-testid="asistente-core-feedback-toast"
          className="hidden"
          data-feedback-text={feedbackMessage}
        >
          {feedbackMessage}
        </div>
      )}
    </>
  );
}
