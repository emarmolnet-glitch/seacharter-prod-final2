import React from "react";
import { createRoot } from "react-dom/client";
import NLPInputWidget from "./components/NLPInputWidget.jsx";

const container = document.getElementById("nlp-input-widget-root");

if (container) {
  createRoot(container).render(<NLPInputWidget />);
}
