function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function hasValidImoChecksum(imo) {
  if (!/^\d{7}$/.test(imo)) return false;
  const digits = imo.split("").map(Number);
  const checksum = digits.slice(0, 6).reduce((sum, digit, index) => sum + digit * (7 - index), 0) % 10;
  return checksum === digits[6];
}

function hasMatchingVesselName(text, vesselName) {
  const normalizedText = normalizeSearchText(text);
  const normalizedName = normalizeSearchText(vesselName);
  if (!normalizedText || !normalizedName) return false;
  if (normalizedText.includes(normalizedName)) return true;
  const nameTokens = normalizedName.split(" ").filter((token) => token.length >= 2);
  return nameTokens.length > 0 && nameTokens.every((token) => normalizedText.includes(token));
}

export function extractValidatedImoFromSearchTexts(texts, vesselName) {
  for (const text of texts) {
    if (!hasMatchingVesselName(text, vesselName) || !/\bimo\b/i.test(text)) continue;
    for (const match of String(text).matchAll(/\b\d{7}\b/g)) {
      if (hasValidImoChecksum(match[0])) return match[0];
    }
  }
  return null;
}
