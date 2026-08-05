import React from "react";
import { createRoot } from "react-dom/client";
import DSSEmptyState from "./components/DSSEmptyState";

const container = document.getElementById("dss-empty-state");

if (container) {
  createRoot(container).render(<DSSEmptyState />);
}
