import React from "react";
import { createRoot } from "react-dom/client";
import RouteConfigurator from "./components/RouteConfigurator";

const container = document.getElementById("route-configurator-root");

if (container) {
  createRoot(container).render(<RouteConfigurator />);
}
