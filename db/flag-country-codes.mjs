const FLAG_COUNTRY_TO_ISO_ALPHA2 = Object.freeze({
  antiguaandbarbuda: "AG",
  bahamas: "BS",
  barbados: "BB",
  belize: "BZ",
  bermuda: "BM",
  brazil: "BR",
  canada: "CA",
  caymanislands: "KY",
  china: "CN",
  cookislands: "CK",
  curacao: "CW",
  cyprus: "CY",
  denmark: "DK",
  finland: "FI",
  france: "FR",
  germany: "DE",
  gibraltar: "GI",
  greece: "GR",
  hongkong: "HK",
  hongkongchina: "HK",
  india: "IN",
  indonesia: "ID",
  isleofman: "IM",
  italy: "IT",
  japan: "JP",
  liberia: "LR",
  malaysia: "MY",
  malta: "MT",
  marshallislands: "MH",
  mexico: "MX",
  netherlands: "NL",
  norway: "NO",
  palau: "PW",
  panama: "PA",
  philippines: "PH",
  portugal: "PT",
  qatar: "QA",
  russia: "RU",
  russianfederation: "RU",
  saintvincentandthegrenadines: "VC",
  saudiarabia: "SA",
  singapore: "SG",
  southkorea: "KR",
  spain: "ES",
  sweden: "SE",
  taiwan: "TW",
  turkey: "TR",
  turkiye: "TR",
  unitedarabemirates: "AE",
  unitedkingdom: "GB",
  unitedstates: "US",
  unitedstatesofamerica: "US",
  vanuatu: "VU",
  vietnam: "VN",
});

const KNOWN_ALPHA2_CODES = new Set(Object.values(FLAG_COUNTRY_TO_ISO_ALPHA2));

function normalizeCountryName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function toIsoAlpha2Flag(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const existingCode = text.toUpperCase();
  if (/^[A-Z]{2}$/.test(existingCode) && KNOWN_ALPHA2_CODES.has(existingCode)) {
    return existingCode;
  }

  return FLAG_COUNTRY_TO_ISO_ALPHA2[normalizeCountryName(text)] || null;
}

export { FLAG_COUNTRY_TO_ISO_ALPHA2 };
