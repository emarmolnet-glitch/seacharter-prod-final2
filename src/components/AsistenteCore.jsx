import React, { useEffect, useState, useCallback } from "react";
import {
  agregarMensajeAsistente,
  buildVesselRescueMessage,
  evaluateVesselAvailability,
  isNoVesselsError,
} from "../sea-assistant-entry.js";

export {
  agregarMensajeAsistente,
  buildVesselRescueMessage,
  evaluateVesselAvailability,
  isNoVesselsError,
};

/**
 * Hook para interactuar con el Asistente Core y el gestor de estado del chat lateral.
 */
export function useAsistenteCore() {
  const [isAvailable, setIsAvailable] = useState(true);

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
  };
}

/**
 * Componente AsistenteCore de React para integración en el layout o panel lateral.
 */
export default function AsistenteCore({ autoRescue = false, context = {}, onRescueTriggered }) {
  const { checkAvailability, triggerTwinVesselRescue } = useAsistenteCore();

  useEffect(() => {
    if (autoRescue) {
      checkAvailability(context).then((res) => {
        if (res.hasViableVessels === false && typeof onRescueTriggered === "function") {
          onRescueTriggered(res);
        }
      });
    }
  }, [autoRescue, context, checkAvailability, onRescueTriggered]);

  return (
    <div className="asistente-core-react-bridge" data-testid="asistente-core-bridge" style={{ display: "none" }}>
      {/* Puente React para el gestor de estado del Asistente Core */}
    </div>
  );
}
