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
    label: "LIVE TRACKING",
    state: "secure",
    icon: "fa-solid fa-satellite-dish",
    bridgeTitle: "Radar conectado en tiempo real por WebSocket",
  },
  fallback: {
    label: "SYNC HTTP · 30S",
    state: "fallback",
    icon: "fa-solid fa-arrows-rotate",
    bridgeTitle: "Sincronización silenciosa mediante polling HTTP cada 30 segundos",
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

export function ConnectionStatusBar() {
  const [status, setStatus] = React.useState(() => window.__dataBridgeConnectionStatus || "fallback");
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.inactive;

  React.useEffect(() => {
    const handleStatusUpdate = (event) => {
      const nextStatus = event.detail?.status;
      if (STATUS_CONFIG[nextStatus]) setStatus(nextStatus);
    };

    window.addEventListener("connection-status:update", handleStatusUpdate);
    return () => window.removeEventListener("connection-status:update", handleStatusUpdate);
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
