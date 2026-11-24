/**
 * Browser bridge for the H16 port sheet (ports_master.source_payload.h16_port_sheet).
 *
 * - Renders the real port restrictions on the Section 1 POL/POD cards.
 * - Resolves the active vessel (draft / LOA / beam / TPC) and evaluates the
 *   route so the voyage engine can flag port restrictions in the Risk Matrix.
 *
 * Exposed as window.SeaCharterPortH16 (consumed lazily by index.html and
 * voyage-cost-engine.js).
 */
import "./port-h16-card.css";
import {
  DEFAULT_PORT_RESTRICTION_BUFFER_DAYS,
  STANDARD_SEAWATER_DENSITY,
  adjustDraftForWaterDensity,
  buildPortH16Badges,
  evaluateRoutePortRestrictions,
  evaluateVesselPortFit,
  parseH16PortSheet,
  resolvePortH16Profile,
} from "../shared/port-h16-sheet.mjs";

const BUFFER_STORAGE_KEY = "seacharter.portRestrictionBufferDays";
const PORT_CARD_TARGETS = [
  { role: "BALLAST", inputId: "port-ballast", limitsId: "port-ballast-limits", draftId: "port-ballast-draft", lengthId: "port-ballast-length" },
  { role: "POL", inputId: "port-pol", limitsId: "port-pol-limits", draftId: "port-pol-draft", lengthId: "port-pol-length" },
  { role: "POD", inputId: "port-pod", limitsId: "port-pod-limits", draftId: "port-pod-draft", lengthId: "port-pod-length" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatMeters(value, decimals = 2) {
  return Number.isFinite(value) ? `${value.toFixed(decimals)} m` : "N/A";
}

function formatLength(value) {
  if (!Number.isFinite(value)) return "N/A";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} m`;
}

export function getBufferDaysPerPort() {
  const fromWindow = Number(window.SeaCharterPortRestrictionBufferDays);
  if (Number.isFinite(fromWindow) && fromWindow >= 0) return fromWindow;
  try {
    const stored = window.localStorage?.getItem(BUFFER_STORAGE_KEY);
    const parsed = stored === null || stored === undefined ? NaN : Number(stored);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch {
    // Storage unavailable (private mode): keep default.
  }
  return DEFAULT_PORT_RESTRICTION_BUFFER_DAYS;
}

export function setBufferDaysPerPort(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  const normalized = Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 10) : DEFAULT_PORT_RESTRICTION_BUFFER_DAYS;
  window.SeaCharterPortRestrictionBufferDays = normalized;
  try {
    window.localStorage?.setItem(BUFFER_STORAGE_KEY, String(normalized));
  } catch {
    // Ignore storage failures.
  }
  return normalized;
}

function readInputNumber(id) {
  return positive(document.getElementById(id)?.value);
}

/** The hidden `vessel-draft`/`vessel-loa` inputs can be auto-filled with route limits; ignore those values. */
function isRouteLimitAutofill(id, value) {
  const autofill = Number(document.getElementById(id)?.dataset?.routeLimitAutofill);
  return Number.isFinite(autofill) && Math.abs(autofill - value) < 1e-6;
}

function readVesselInput(id) {
  const value = positive(document.getElementById(id)?.value);
  return value && !isRouteLimitAutofill(id, value) ? value : 0;
}

function vesselStateValue(value, inputId) {
  const number = positive(value);
  return number && !isRouteLimitAutofill(inputId, number) ? number : 0;
}

/**
 * Vessel draft priority (same as the calculator and Datalastic Port Intelligence):
 *   1. Visible "Calado Actual (m)" input (#current-draft).
 *   2. Operating draft already calculated on the voyage result/state.
 *   3. Hidden #vessel-draft only when it holds a real vessel value (not a route-limit autofill).
 *   4. State draft / H15 technical sheet.
 */
export function resolveVesselDraft(state = window.State || {}) {
  const technicalSheet = state?.h15_technical_sheet || state?.source_payload?.h15_technical_sheet || {};
  return readInputNumber("current-draft")
    || positive(state?.calado_actual)
    || positive(state?.currentDraft)
    || positive(state?.calculatedDraft)
    || positive(state?.actualDraft)
    || readVesselInput("vessel-draft")
    || vesselStateValue(state?.draft, "vessel-draft")
    || positive(technicalSheet?.summer_draft_m ?? technicalSheet?.draft_m ?? technicalSheet?.draft);
}

export function resolveActiveVessel(state = window.State || {}) {
  const technicalSheet = state?.h15_technical_sheet || state?.source_payload?.h15_technical_sheet || {};
  const draftM = resolveVesselDraft(state);
  const loaM = readInputNumber("vessel-identity-loa")
    || readVesselInput("vessel-loa")
    || vesselStateValue(state?.loa, "vessel-loa")
    || positive(technicalSheet?.loa_m ?? technicalSheet?.loa);
  const beamM = positive(state?.beam) || readInputNumber("vessel-identity-beam")
    || positive(technicalSheet?.beam_m ?? technicalSheet?.beam);
  const tpc = positive(state?.tpc) || positive(state?.TPC) || positive(technicalSheet?.tpc ?? technicalSheet?.tpc_t_cm);
  const cargoTons = positive(state?.cargo) || positive(state?.cargoQuantity) || readInputNumber("cargo-qty");
  const dwt = positive(state?.dwt) || readInputNumber("vessel-identity-dwt");
  return { draftM, loaM, beamM, tpc, cargoTons, dwt };
}

function findPortRecord(name) {
  if (!name) return null;
  if (typeof window.findPortData === "function") return window.findPortData(name) || null;
  return window.PORT_DB?.[name] || null;
}

export function evaluateCurrentRoute(state = window.State || {}) {
  const ports = PORT_CARD_TARGETS
    .filter((target) => target.role !== "BALLAST")
    .map((target) => {
      const name = document.getElementById(target.inputId)?.value?.trim() || "";
      return { role: target.role, name, port: name ? findPortRecord(name) : null };
    });
  const vessel = resolveActiveVessel(state);
  const evaluation = evaluateRoutePortRestrictions(ports, vessel, { bufferDaysPerPort: getBufferDaysPerPort() });
  return { ...evaluation, vessel, bufferDaysPerPort: getBufferDaysPerPort() };
}

// Open/closed state of the "Avisos operativos H16" <details>, per port role. Kept across re-renders.
const warningsOpenState = new Map();
// Last HTML written per card element, so unchanged content never rewrites the DOM.
const lastRenderedCardHtml = new WeakMap();

document.addEventListener("toggle", (event) => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.classList.contains("h16-port-card__warnings")) return;
  const role = details.dataset.h16Role;
  if (!role) return;
  warningsOpenState.set(role, details.open);
  // The card may have been re-rendered between the click and this (async) event:
  // carry the user's choice over to the live element.
  if (!details.isConnected) {
    document.querySelectorAll(`details.h16-port-card__warnings[data-h16-role="${role}"]`).forEach((live) => {
      if (live.open !== details.open) live.open = details.open;
    });
  }
}, true);

function isWarningsOpen(role, fit) {
  return warningsOpenState.has(role) ? warningsOpenState.get(role) : Boolean(fit?.isCritical);
}

function buildCardHtml(profile, fit, role) {
  const draftSource = profile.effectiveDraftLabel ? ` <span class="h16-port-card__muted">(${escapeHtml(profile.effectiveDraftLabel)})</span>` : "";
  const lowWater = profile.lowWaterDraftM !== null
    ? ` <span class="h16-port-card__muted">· Bajamar ${escapeHtml(formatMeters(profile.lowWaterDraftM))}</span>`
    : "";
  const beam = profile.maxBeamM !== null
    ? ` <span class="h16-port-card__muted">· Manga Máx: ${escapeHtml(formatMeters(profile.maxBeamM))}</span>`
    : "";
  const badges = buildPortH16Badges(profile)
    .map((badge) => `<span class="h16-port-badge h16-port-badge--${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>`)
    .join("");

  let alertHtml = "";
  if (role !== "BALLAST" && fit?.isCritical) {
    const breaches = fit.breaches.map((breach) => `<li>${escapeHtml(breach.message)}</li>`).join("");
    const cargoCut = fit.cargoCutTons
      ? `<li>Recorte orientativo de carga: ~${escapeHtml(fit.cargoCutTons.toLocaleString("es-ES"))} MT${fit.cargoCutPct ? ` (${escapeHtml(fit.cargoCutPct.toFixed(1))}% de la carga)` : ""}${fit.tpcEstimated ? " · TPC estimado" : ""}.</li>`
      : "";
    alertHtml = `
      <div class="h16-port-alert" role="alert">
        <strong><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> RESTRICCIÓN DE PUERTO · NO VIABLE A PLENA CARGA</strong>
        <ul>${breaches}${cargoCut}</ul>
      </div>`;
  } else if (role !== "BALLAST" && fit?.hasData && fit.adjustedDraftM !== null && fit.draftMarginM !== null) {
    const fwa = fit.densityCorrectionApplied ? ` (FWA ${fit.adjustedDraftM.toFixed(2)} m)` : "";
    alertHtml = `<div class="h16-port-card__ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Calado buque ${escapeHtml(fit.vesselDraftM.toFixed(2))} m${escapeHtml(fwa)} · margen ${escapeHtml(fit.draftMarginM.toFixed(2))} m${fit.tidalAdvisory ? " · requiere marea" : ""}</div>`;
  }

  const warnings = profile.operationalWarnings.length
    ? `<details class="h16-port-card__warnings" data-h16-role="${escapeHtml(role)}"${isWarningsOpen(role, fit) ? " open" : ""}><summary>Avisos operativos H16 (${profile.operationalWarnings.length})</summary><ul>${profile.operationalWarnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`
    : "";

  return `
    <div class="h16-port-card${fit?.isCritical && role !== "BALLAST" ? " h16-port-card--critical" : ""}" data-h16-port-card="${escapeHtml(role)}">
      <div>Calado Efectivo: <strong>${escapeHtml(formatMeters(profile.effectiveDraftM))}</strong>${draftSource}${lowWater}</div>
      <div>Eslora Máx: <strong>${escapeHtml(formatLength(profile.maxLoaM))}</strong>${beam}</div>
      ${badges ? `<div class="h16-port-card__badges">${badges}</div>` : ""}
      ${alertHtml}
      ${warnings}
    </div>`;
}

/**
 * Renders the H16 card for a port. Returns false when the port has no H16 data
 * so the caller can fall back to the legacy WPI rendering.
 */
export function renderPortCard(target, portData, role = "POL", state = window.State || {}) {
  const profile = resolvePortH16Profile(portData);
  if (!profile.hasData) return false;
  const el = typeof target === "string" ? document.getElementById(target) : target;
  const fit = role === "BALLAST"
    ? null
    : evaluateVesselPortFit(profile, resolveActiveVessel(state), { bufferDaysPerPort: getBufferDaysPerPort() });
  if (el) {
    const html = buildCardHtml(profile, fit, role);
    // Skip the DOM write when nothing changed, so an open <details> is never reset.
    if (lastRenderedCardHtml.get(el) !== html || !el.querySelector(`[data-h16-port-card="${role}"]`)) {
      el.innerHTML = html;
      lastRenderedCardHtml.set(el, html);
    }
  }
  const config = PORT_CARD_TARGETS.find((item) => item.role === role);
  if (config) {
    const draftEl = document.getElementById(config.draftId);
    const lengthEl = document.getElementById(config.lengthId);
    if (draftEl) draftEl.value = formatMeters(profile.effectiveDraftM);
    if (lengthEl) lengthEl.value = formatLength(profile.maxLoaM);
  }
  return true;
}

/** Re-renders the POL/POD cards (e.g. after the vessel draft changes). */
export function refreshPortCards(state = window.State || {}) {
  PORT_CARD_TARGETS.forEach((target) => {
    const name = document.getElementById(target.inputId)?.value?.trim() || "";
    const el = document.getElementById(target.limitsId);
    if (!name || !el) return;
    const port = findPortRecord(name);
    if (port) renderPortCard(el, port, target.role, state);
  });
}

// Re-evaluate cards and Risk Matrix when the visible "Calado Actual (m)" changes.
let draftRefreshTimer = null;
document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== "current-draft") return;
  clearTimeout(draftRefreshTimer);
  draftRefreshTimer = setTimeout(() => {
    refreshPortCards();
    if (typeof window.runEngine === "function") window.runEngine();
  }, 350);
});

document.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== "port-restriction-buffer-days") return;
  setBufferDaysPerPort(input.value);
  if (typeof window.runEngine === "function") window.runEngine();
});

const api = {
  STANDARD_SEAWATER_DENSITY,
  DEFAULT_PORT_RESTRICTION_BUFFER_DAYS,
  parseH16PortSheet,
  resolvePortH16Profile,
  buildPortH16Badges,
  adjustDraftForWaterDensity,
  evaluateVesselPortFit,
  evaluateRoutePortRestrictions,
  resolveActiveVessel,
  resolveVesselDraft,
  evaluateCurrentRoute,
  renderPortCard,
  refreshPortCards,
  getBufferDaysPerPort,
  setBufferDaysPerPort,
};

window.SeaCharterPortH16 = api;
window.dispatchEvent(new CustomEvent("seacharter:port-h16-ready"));
// Cards may have been rendered by the legacy path before this module loaded.
refreshPortCards();

export default api;
