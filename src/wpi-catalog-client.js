function cleanText(value) {
  return String(value ?? "").trim();
}

function toPortTitleCase(value) {
  const rawValue = cleanText(value);
  if (!rawValue) return "";
  const suffixMatch = rawValue.match(/\s*(\([A-Za-z]{2,3}\))\s*$/);
  const suffix = suffixMatch ? ` ${suffixMatch[1].toUpperCase()}` : "";
  const name = (suffixMatch ? rawValue.slice(0, suffixMatch.index) : rawValue)
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'/])([a-zà-ÿ])/g, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase()}`);
  return `${name}${suffix}`.trim();
}

export function normalizeWpiPortRecord(value) {
  if (!value) return null;
  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lon ?? value.lng);
  const name = toPortTitleCase(value.portName || value.name || value.placeName);
  const countryCode = cleanText(value.countryCode).toUpperCase();
  const officialLabel = toPortTitleCase(value.officialLabel || value.label || `${name} (${countryCode || "INT"})`);
  if (!officialLabel || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    ...value,
    uuid: cleanText(value.uuid),
    unlocode: cleanText(value.unlocode).toUpperCase(),
    name,
    officialLabel,
    countryCode,
    latitude,
    longitude,
    maxOperationalDraftMeters: 0,
    maxVesselLengthLabel: "N/A",
    engineeringSource: "N/A",
    source: "DATALASTIC",
  };
}

export function prioritizeDatalasticPortRecords(ports = []) {
  const normalizedPorts = (Array.isArray(ports) ? ports : [])
    .map(normalizeWpiPortRecord)
    .filter(Boolean);
  const commercialPorts = normalizedPorts.filter((port) => cleanText(port.portType).toLowerCase() === "port");
  return commercialPorts.length ? commercialPorts : normalizedPorts;
}

export async function ensureGlobalWpiCatalog() {
  return window.ensureWpiEngineeringCatalog?.() || window.WpiCatalogStore?.getState?.() || null;
}

async function enrichPortWithWpi(port) {
  if (!port) return null;
  const engineering = await window.resolveWpiEngineeringRecord?.(port);
  return {
    ...port,
    maxOperationalDraftMeters: Number(engineering?.maxOperationalDraftMeters) || 0,
    maxVesselLengthLabel: engineering?.maxVesselLengthLabel || "N/A",
    cargoDepth: engineering?.cargoDepth || "",
    channelDepth: engineering?.channelDepth || "",
    depthCode: engineering?.depthCode || "",
    indexNo: engineering?.indexNo || null,
    engineeringSource: engineering ? "WPI" : "N/A",
  };
}

async function findPort(query) {
  if (!query) return null;
  const [response] = await Promise.all([
    fetch(`/api/v1/ports/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json" },
    }),
    ensureGlobalWpiCatalog(),
  ]);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Datalastic no está disponible.");
  return enrichPortWithWpi(prioritizeDatalasticPortRecords(payload?.ports)[0] || null);
}

export async function validateScenarioPortsWithWpi(scenario = {}) {
  const polText = cleanText(scenario.pol);
  const podText = cleanText(scenario.pod);
  const [polPort, podPort] = await Promise.all([findPort(polText), findPort(podText)]);
  const unresolved = [
    ...(!polPort && polText ? [`POL “${polText}”`] : []),
    ...(!podPort && podText ? [`POD “${podText}”`] : []),
  ];

  return {
    ...scenario,
    pol: polPort?.officialLabel || toPortTitleCase(polText),
    pod: podPort?.officialLabel || toPortTitleCase(podText),
    pol_port: polPort,
    pod_port: podPort,
    port_validation: {
      valid: Boolean(polPort && podPort),
      source: "DATALASTIC_WPI",
      pol: { valid: Boolean(polPort), query: polText, match: polPort },
      pod: { valid: Boolean(podPort), query: podText, match: podPort },
      clarification: unresolved.length
        ? `${unresolved.join(" y ")} no pudo resolverse con Datalastic. Selecciona el puerto correcto en el desplegable.`
        : "",
    },
  };
}
