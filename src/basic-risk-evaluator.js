const OPERATIONAL_RATE_THRESHOLD_MT_DAY = 2_000;

const GEOPOLITICAL_WATCH_COUNTRIES = Object.freeze({
  AF: ["afganistan", "afghanistan"],
  AL: ["albania"],
  AZ: ["azerbaiyan", "azerbaijan"],
  BD: ["bangladesh"],
  BH: ["barein", "bahrain"],
  BN: ["brunei"],
  CI: ["costa de marfil", "cote d ivoire", "ivory coast"],
  CM: ["camerun", "cameroon"],
  DZ: ["argelia", "algeria"],
  EG: ["egipto", "egypt"],
  GM: ["gambia"],
  GN: ["guinea"],
  ID: ["indonesia"],
  IQ: ["irak", "iraq"],
  IR: ["iran"],
  JO: ["jordania", "jordan"],
  KG: ["kirguistan", "kyrgyzstan"],
  KW: ["kuwait"],
  KZ: ["kazajistan", "kazakhstan"],
  LB: ["libano", "lebanon"],
  LY: ["libia", "libya"],
  MA: ["marruecos", "morocco"],
  ML: ["mali"],
  MR: ["mauritania"],
  MV: ["maldivas", "maldives"],
  MY: ["malasia", "malaysia"],
  NE: ["niger"],
  NG: ["nigeria"],
  OM: ["oman"],
  PK: ["pakistan"],
  PS: ["palestina", "palestine"],
  QA: ["catar", "qatar"],
  SA: ["arabia saudi", "saudi arabia"],
  SD: ["sudan"],
  SN: ["senegal"],
  SO: ["somalia"],
  SY: ["siria", "syria"],
  TD: ["chad"],
  TJ: ["tayikistan", "tajikistan"],
  TN: ["tunez", "tunisia"],
  TR: ["turquia", "turkey", "turkiye"],
  TM: ["turkmenistan"],
  AE: ["emiratos arabes unidos", "united arab emirates", "uae"],
  UZ: ["uzbekistan"],
  YE: ["yemen"],
});

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasWatchedCountry(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;

  const tokens = new Set(normalized.toUpperCase().split(/\s+/));
  const paddedValue = ` ${normalized} `;
  return Object.entries(GEOPOLITICAL_WATCH_COUNTRIES).some(([code, names]) => (
    tokens.has(code) || names.some((name) => paddedValue.includes(` ${normalizeText(name)} `))
  ));
}

function isLowOperationalRate(value) {
  if (value === null || value === undefined || value === "") return false;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate < OPERATIONAL_RATE_THRESHOLD_MT_DAY;
}

function isCharterer(role) {
  const normalized = normalizeText(role);
  return normalized === "charterer" || normalized.includes("fletador");
}

function isShinc(value) {
  return String(value ?? "").trim().toUpperCase() === "SHINC";
}

export function evaluateBasicRisks(context = {}) {
  const pol = context.pol ?? context.geographic?.pol ?? "";
  const pod = context.pod ?? context.geographic?.pod ?? "";
  const loadRate = context.loadRate ?? context.operational?.loadRate;
  const dischargeRate = context.dischargeRate ?? context.operational?.dischargeRate;
  const role = context.role ?? context.financial?.role ?? "";
  const loadTerms = context.loadTerms ?? context.financial?.loadTerms ?? "";
  const dischargeTerms = context.dischargeTerms ?? context.financial?.dischargeTerms ?? "";

  const risks = {
    geopolitical: hasWatchedCountry(pol) || hasWatchedCountry(pod),
    operational: isLowOperationalRate(loadRate) || isLowOperationalRate(dischargeRate),
    financial: isCharterer(role) && (isShinc(loadTerms) || isShinc(dischargeTerms)),
  };

  return {
    alerts: Object.values(risks).filter(Boolean).length,
    risks,
  };
}

export { GEOPOLITICAL_WATCH_COUNTRIES, OPERATIONAL_RATE_THRESHOLD_MT_DAY };
