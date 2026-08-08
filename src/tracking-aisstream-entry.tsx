import React from "react";
import { createRoot } from "react-dom/client";
import TrackingAisStreamBridge from "./components/TrackingAisStreamBridge";

const container = document.createElement("div");
container.id = "tracking-aisstream-bridge-root";
container.hidden = true;
document.body.appendChild(container);

createRoot(container).render(
  <React.StrictMode>
    <TrackingAisStreamBridge />
  </React.StrictMode>,
);
