function cleanText(value) {
  return String(value ?? "").trim();
}

export function normalizeWpiPortRecord(value) {
  if (!value || value.source !== "WPI") return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lon ?? value.lng);
  const officialLabel = cleanText(value.officialLabel || value.label);
  const name = cleanText(value.name || value.placeName || officialLabel.replace(/\s*\([A-Za-z]{2,3}\)\s*$/, ""));
  const countryCode = cleanText(value.countryCode).toUpperCase();
  if (!officialLabel || !name || !countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    ...value,
    indexNo: Number(value.indexNo) || null,
    regionNo: Number(value.regionNo) || null,
    name,
    officialLabel,
    countryCode,
    latitude,
    longitude,
    source: "WPI",
  };
}

export async function ensureGlobalWpiCatalog() {
  await window.ensureWpiCatalogLoaded?.();
  return window.WpiCatalogStore?.getState?.() || null;
}

export async function validateScenarioPortsWithWpi(scenario = {}) {
  await ensureGlobalWpiCatalog();
  const catalog = window.WpiCatalogStore;
  const polText = cleanText(scenario.pol);
  const podText = cleanText(scenario.pod);
  const polPort = normalizeWpiPortRecord(catalog?.findExactPort?.(polText));
  const podPort = normalizeWpiPortRecord(catalog?.findExactPort?.(podText));
  const unresolved = [
    ...(!polPort && polText ? [`POL “${polText}”`] : []),
    ...(!podPort && podText ? [`POD “${podText}”`] : []),
  ];

  return {
    ...scenario,
    pol: polPort?.officialLabel || polText,
    pod: podPort?.officialLabel || podText,
    pol_port: polPort,
    pod_port: podPort,
    port_validation: {
      valid: Boolean(polPort && podPort),
      pol: { valid: Boolean(polPort), query: polText, match: polPort },
      pod: { valid: Boolean(podPort), query: podText, match: podPort },
      clarification: unresolved.length
        ? `${unresolved.join(" y ")} no coincide exactamente con el catálogo WPI. Selecciona el puerto correcto en el desplegable.`
        : "",
    },
  };
}
