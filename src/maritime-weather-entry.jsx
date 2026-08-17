import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import MaritimeWeatherPanel from "./components/MaritimeWeatherPanel.jsx";
import { voyageStore } from "./stores/voyage-store.js";

function MaritimeWeatherStoreBridge() {
  const draft = useSyncExternalStore(
    voyageStore.subscribe,
    () => voyageStore.getState().draft,
    () => voyageStore.getState().draft,
  );

  return (
    <MaritimeWeatherPanel
      pol={draft.pol}
      pod={draft.pod}
      laydays={draft.laycan?.laydays}
      cancelling={draft.laycan?.cancelling}
    />
  );
}

const container = document.getElementById("maritime-weather-panel-root");

if (container) {
  createRoot(container).render(<MaritimeWeatherStoreBridge />);
}
