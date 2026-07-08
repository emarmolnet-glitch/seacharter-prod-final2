import React, { useCallback, useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const VERIFY_ENDPOINT = "/api/verify-connection";
const POLLING_INTERVAL_MS = 30000;
const REQUEST_TIMEOUT_MS = 8000;
const PULSE_DURATION_MS = 1200;

const STATUS_CONFIG = {
  secure: {
    label: "Secure Connection",
    state: "secure",
    icon: "fa-solid fa-bridge-lock",
    bridgeTitle: "Data Bridge secure",
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

function isValidBroadcastMessage(message) {
  if (!message || typeof message !== "object") return false;
  return Boolean(
    message.type ||
      message.event ||
      message.payload ||
      message.data ||
      message.source === "SeaCharter Data Bridge" ||
      message.source === "Core PRO",
  );
}

export function ConnectionStatusBar() {
  const [status, setStatus] = useState("disconnected");
  const [pulse, setPulse] = useState(false);

  const config = useMemo(() => STATUS_CONFIG[status] || STATUS_CONFIG.disconnected, [status]);

  const verifyConnection = useCallback(async () => {
    const token = String(
      import.meta.env?.VITE_DATA_BRIDGE_API_SECRET ||
        window.localStorage?.getItem("seacharter_databridge_api_secret") ||
        "",
    ).trim();
    const requestHeaders = { Accept: "application/json" };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(VERIFY_ENDPOINT, {
        method: "POST",
        headers: requestHeaders,
        signal: controller.signal,
      });

      if (response.status === 200) {
        setStatus("secure");
      } else if (response.status === 401) {
        setStatus("unauthorized");
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("disconnected");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    verifyConnection();
    const intervalId = window.setInterval(verifyConnection, POLLING_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [verifyConnection]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel("seacharter_broadcast");
    let pulseTimeoutId = 0;

    channel.onmessage = (event) => {
      if (!isValidBroadcastMessage(event.data)) return;
      setPulse(false);
      window.requestAnimationFrame(() => {
        setPulse(true);
        pulseTimeoutId = window.setTimeout(() => setPulse(false), PULSE_DURATION_MS);
      });
    };

    return () => {
      window.clearTimeout(pulseTimeoutId);
      channel.close();
    };
  }, []);

  return (
    React.createElement(
      "div",
      {
        className: `connection-status-bar ${pulse ? "is-pulsing" : ""}`,
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
      ),
      React.createElement(
        "div",
        { className: "connection-status-node", title: config.bridgeTitle },
        React.createElement("span", { className: "connection-status-icon", "aria-hidden": "true" }, React.createElement("i", { className: config.icon })),
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
  return root;
}

mountConnectionStatusBar();
