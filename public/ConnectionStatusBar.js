import React from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const STATUS_CONFIG = {
  inactive: {
    label: "Inactivo",
    state: "inactive",
    icon: "fa-solid fa-circle-pause",
    bridgeTitle: "Data Bridge inactivo",
  },
  secure: {
    label: "CONNECTED",
    state: "secure",
    icon: "fa-solid fa-circle-check",
    bridgeTitle: "Data Bridge online mediante sincronización REST HTTP",
  },
  connected: {
    label: "CONNECTED",
    state: "secure",
    icon: "fa-solid fa-circle-check",
    bridgeTitle: "Data Bridge conectado",
  },
  ok: {
    label: "CONNECTED",
    state: "secure",
    icon: "fa-solid fa-circle-check",
    bridgeTitle: "Data Bridge conectado (Status OK)",
  },
  persisted: {
    label: "CONNECTED",
    state: "secure",
    icon: "fa-solid fa-circle-check",
    bridgeTitle: "Data Bridge conectado (Status PERSISTED)",
  },
  fallback: {
    label: "SYNC HTTP · 10S",
    state: "fallback",
    icon: "fa-solid fa-arrows-rotate",
    bridgeTitle: "Comprobando disponibilidad REST de Data Bridge",
  },
  unauthorized: {
    label: "Unauthorized",
    state: "unauthorized",
    icon: "fa-solid fa-lock-open",
    bridgeTitle: "Data Bridge unauthorized",
  },
  disconnected: {
    label: "Disconnected",
    state: "disconnected",
    icon: "fa-solid fa-plug-circle-xmark",
    bridgeTitle: "Data Bridge disconnected",
  },
};

function resolveStatusKey(statusValue) {
  const normalized = String(statusValue || "").trim().toLowerCase();
  if (normalized === "ok" || normalized === "persisted" || normalized === "connected" || normalized === "live" || normalized === "ready") {
    return "secure";
  }
  return STATUS_CONFIG[normalized] ? normalized : "inactive";
}

export function ConnectionStatusBar() {
  const [status, setStatus] = React.useState(() => window.__dataBridgeConnectionStatus || "inactive");
  const effectiveStatus = resolveStatusKey(status);
  const config = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.inactive;

  React.useEffect(() => {
    const handleStatusUpdate = (event) => {
      const nextStatus = event.detail?.status;
      if (nextStatus !== undefined && nextStatus !== null) {
        const resolved = resolveStatusKey(nextStatus);
        if (STATUS_CONFIG[resolved]) setStatus(resolved);
      }
    };

    window.addEventListener("connection-status:update", handleStatusUpdate);
    return () => window.removeEventListener("connection-status:update", handleStatusUpdate);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") {
      return;
    }

    const channel = new window.BroadcastChannel("seacharter_sync_channel");
    console.log("[Core PRO] Canal de sincronización abierto");

    let lastPersistedRef = "";
    let isSaving = false;
    let debounceTimer = null;

    const persistActiveSessionToBackend = (ref, immediate = false) => {
      const normalized = String(ref || "").trim().toUpperCase();
      if (!normalized || typeof window.fetch !== "function") return;
      if (normalized === lastPersistedRef) return;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      const executeSave = () => {
        if (isSaving) return;
        isSaving = true;

        if (typeof window.ContractRefManager?.persistSessionToDatabase === "function") {
          window.ContractRefManager.persistSessionToDatabase(normalized, null, true)
            .then((data) => {
              if (data) lastPersistedRef = normalized;
            })
            .catch(() => {})
            .finally(() => { isSaving = false; });
        } else {
          window.fetch("/api/app-state", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              id: "current_session",
              key: "current_session",
              session_ref: normalized,
              currentSessionRef: normalized,
              reference: normalized,
              timestamp: Date.now(),
            }),
          })
            .then((res) => {
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
              }
              return res.json();
            })
            .then((data) => {
              lastPersistedRef = normalized;
              console.log("[Core PRO] Sesión activa guardada en Neon:", normalized);
            })
            .catch((err) => {
              console.warn("[Core PRO] No se pudo persistir la sesión activa en backend:", err?.message || err);
            })
            .finally(() => { isSaving = false; });
        }
      };

      if (immediate) {
        executeSave();
      } else {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          executeSave();
        }, 500);
      }
    };

    const initialRef =
      window.ContractRefManager?.getActiveContractRef?.() ||
      window.ContractReference?.getActiveContractRef?.() ||
      window.getActiveContractRef?.() ||
      (typeof window.sessionStorage !== "undefined" ? window.sessionStorage.getItem("active_contract_ref") : null) ||
      "";
    if (initialRef) {
      persistActiveSessionToBackend(initialRef);
    }

    channel.onmessage = (event) => {
      const data = event?.data;
      if (data?.type === "PING_SESSION" || data === "PING_SESSION") {
        const currentSessionRef =
          window.ContractRefManager?.getActiveContractRef?.() ||
          window.ContractReference?.getActiveContractRef?.() ||
          window.getActiveContractRef?.() ||
          (typeof window.sessionStorage !== "undefined" ? window.sessionStorage.getItem("active_contract_ref") : null) ||
          "";

        console.log("[Core PRO] PING recibido, respondiendo con:", currentSessionRef);
        channel.postMessage({
          type: "CORE_SESSION_ACTIVE",
          reference: currentSessionRef,
        });

        if (currentSessionRef && currentSessionRef !== lastPersistedRef) {
          persistActiveSessionToBackend(currentSessionRef);
        }
      }
    };

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channel.close();
    };
  }, []);

  return (
    React.createElement(
      "div",
      {
        className: "connection-status-bar",
        "data-state": config.state,
        role: "status",
        "aria-live": "polite",
        "aria-label": `Core PRO Data Bridge: ${config.label}`,
      },
      React.createElement(
        "div",
        { className: "connection-status-node", title: "Core PRO" },
        React.createElement("span", { className: "connection-status-icon", "aria-hidden": "true" }, React.createElement("i", { className: "fa-solid fa-server" })),
        React.createElement("span", { className: "connection-status-label" }, "Core PRO"),
      ),
      React.createElement(
        "div",
        { className: "connection-pipeline", "aria-hidden": "true" },
        React.createElement(
          "svg",
          { viewBox: "0 0 100 18", preserveAspectRatio: "none", focusable: "false" },
          React.createElement("path", { className: "connection-pipe-track", d: "M3 9 C25 9 28 9 50 9 S75 9 97 9" }),
          React.createElement("path", { className: "connection-pipe-flow", d: "M3 9 C25 9 28 9 50 9 S75 9 97 9" }),
        ),
        React.createElement("span", { className: "connection-live-icon" }, React.createElement("i", { className: status === "fallback" ? "fa-solid fa-rotate" : config.icon })),
      ),
      React.createElement(
        "div",
        { className: "connection-status-node", title: config.bridgeTitle },
        React.createElement("span", { className: "connection-status-icon", "aria-hidden": "true" }, React.createElement("i", { className: config.icon, "data-connection-bridge-icon": "" })),
        React.createElement("span", { className: "connection-status-label" }, "Data Bridge"),
      ),
      React.createElement("span", { className: "connection-status-text" }, config.label),
    )
  );
}

export function mountConnectionStatusBar(target = document.getElementById("connection-status-root")) {
  if (!target) return null;
  const root = createRoot(target);
  root.render(React.createElement(ConnectionStatusBar));
  return {
    unmount() {
      window.dispatchEvent(new CustomEvent("connection-status:unmount"));
      root.unmount();
    },
  };
}

mountConnectionStatusBar();
