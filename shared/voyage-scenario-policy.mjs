export const VOYAGE_SCENARIO_DEFAULTS = Object.freeze({
  cargo_qty: 0,
  cargo_type: "TBA",
  loading_rate: 0,
  discharge_rate: 0,
  loading_terms: "CQD",
  discharge_terms: "CQD",
});

function cleanText(value) {
  return String(value ?? "").trim();
}

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function getDefaultLaycan(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  if (Number.isNaN(date.getTime())) return "TBA";
  date.setUTCDate(date.getUTCDate() + 15);
  return date.toISOString().slice(0, 10);
}

export function hasMinimumVoyageRoute(scenario = {}) {
  return Boolean(cleanText(scenario.pol) && cleanText(scenario.pod));
}

export function applyVoyageScenarioDefaults(value = {}, referenceDate = new Date()) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackLaycan = getDefaultLaycan(referenceDate);
  const laydays = cleanText(source.laydays ?? source.layday ?? source.laycan_start) || fallbackLaycan;
  const cancelling = cleanText(source.cancelling ?? source.canceling ?? source.laycan_end) || laydays;
  const defaultsApplied = [];

  if (!cleanText(source.laydays ?? source.layday ?? source.laycan_start)) defaultsApplied.push("laydays");
  if (!cleanText(source.cancelling ?? source.canceling ?? source.laycan_end)) defaultsApplied.push("cancelling");
  if (!nonNegativeNumber(source.cargo_qty ?? source.cargoQty ?? source.quantity ?? source.qty)) defaultsApplied.push("cargo_qty");
  if (!cleanText(source.cargo_type ?? source.cargoType ?? source.commodity)) defaultsApplied.push("cargo_type");
  if (!nonNegativeNumber(source.loading_rate ?? source.loadingRate ?? source.load_rate)) defaultsApplied.push("loading_rate");
  if (!nonNegativeNumber(source.discharge_rate ?? source.dischargeRate ?? source.disch_rate)) defaultsApplied.push("discharge_rate");

  return {
    ...source,
    pol: cleanText(source.pol ?? source.port_of_loading ?? source.loading_port),
    pod: cleanText(source.pod ?? source.port_of_discharge ?? source.discharge_port),
    laydays,
    cancelling,
    cargo_qty: nonNegativeNumber(source.cargo_qty ?? source.cargoQty ?? source.quantity ?? source.qty),
    cargo_type: cleanText(source.cargo_type ?? source.cargoType ?? source.commodity) || VOYAGE_SCENARIO_DEFAULTS.cargo_type,
    loading_rate: nonNegativeNumber(source.loading_rate ?? source.loadingRate ?? source.load_rate),
    discharge_rate: nonNegativeNumber(source.discharge_rate ?? source.dischargeRate ?? source.disch_rate),
    loading_terms: cleanText(source.loading_terms ?? source.loadingTerms) || VOYAGE_SCENARIO_DEFAULTS.loading_terms,
    discharge_terms: cleanText(source.discharge_terms ?? source.dischargeTerms) || VOYAGE_SCENARIO_DEFAULTS.discharge_terms,
    defaults_applied: defaultsApplied,
    is_partial: defaultsApplied.length > 0,
  };
}
