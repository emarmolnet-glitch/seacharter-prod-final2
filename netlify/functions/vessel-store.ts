import { getStore } from "@netlify/blobs";

export type VesselRecord = {
  imoNumber: string;
  mmsi: string | null;
  vesselName: string | null;
  shipType: string | null;
  draught: number | null;
  designDraft?: number | null;
  dwt?: number | null;
  cargoClass?: string | null;
  vesselClass?: string | null;
  loadState?: string | null;
  latitude: number;
  longitude: number;
  speed: number | null;
  course: number | null;
  heading: number | null;
  navigationalStatus: string | null;
  destination: string | null;
  lastPortOfCall: string | null;
  predictedDestination?: string | null;
  predictedDestinationConfidence?: number | null;
  eta: string | null;
  estimatedEta?: string | null;
  estimatedEtaTarget?: string | null;
  estimatedEtaDistanceNm?: number | null;
  estimatedEtaHours?: number | null;
  estimatedEtaSpeedKnots?: number | null;
  estimatedEtaConfidence?: "high" | "medium" | "low" | null;
  source: string;
  rawData: unknown;
  classificationSignals?: unknown;
  cementCarrierClassification?: {
    level: "confirmed" | "possible" | "none";
    label: string;
    reasons: string[];
  };
  missingData?: string[];
  classificationComplete?: boolean;
  radarSweepCount?: number;
  firstSeenAt?: string;
  lastSeenAt: string;
  updatedAt: string;
  createdAt: string;
};

const STORE_NAME = "ais-vessels";
const VESSEL_INDEX_KEY = "vessels-index.json";
const CARGO_LOG_KEY = "cargo-vessels-log.csv";
const CARGO_LOG_HEADER = "MMSI,IMO,Nombre,ShipType,Draught,Latitud,Longitud,ETA,ETA_Estimado,ETA_Objetivo,Distancia_NM,Velocidad_Kn,Confianza_ETA";

function getVesselStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function isVesselRecord(value: unknown): value is VesselRecord {
  const vessel = value && typeof value === "object" ? value as Partial<VesselRecord> : {};
  return typeof vessel.imoNumber === "string"
    && Number.isFinite(vessel.latitude)
    && Number.isFinite(vessel.longitude);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseShipTypeCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const match = value.trim().match(/\d+/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
  }
  return null;
}

function normalizeShipTypeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CEMENT_CONFIRMED_TERMS = [
  "cement carrier",
  "cement",
  "cemento",
  "ciment",
  "ciment carrier",
  "clinker carrier",
  "clinker",
];

const CEMENT_POSSIBLE_TERMS = [
  "cem",
  "cementos",
  "cementir",
  "cemex",
  "holcim",
  "lafarge",
  "heidelberg",
  "heidelberg materials",
  "heidelbergcement",
  "buzzi",
  "votorantim",
  "argos",
  "calucem",
  "fym",
  "portland",
  "granel cemento",
  "bulk cement",
  "cement terminal",
  "terminal cemento",
];

const CEMENT_GENERIC_CARGO_TERMS = [
  "cargo",
  "general cargo",
  "bulk",
  "bulker",
  "bulk carrier",
  "carrier",
  "freighter",
];

export function classifyCementCarrierSignal(value: unknown) {
  const source = asRecord(value);
  const raw = asRecord(source.rawData);
  const metadata = asRecord(raw.MetaData);
  const text = normalizeShipTypeText([
    source.vesselName,
    source.shipType,
    source.cargoClass,
    source.vesselClass,
    source.destination,
    source.lastPortOfCall,
    raw.vesselName,
    raw.ShipName,
    raw.name,
    raw.Tipo,
    raw.tipo,
    raw.tipo_carga,
    raw.cargoType,
    raw.cargoTaxonomyLabel,
    raw.categoryLabel,
    raw.categoryValue,
    raw.shipType,
    raw.ShipType,
    raw.vesselType,
    raw.vesselClass,
    raw.destination,
    raw.Destination,
    raw.lastPortOfCall,
    raw.LastPort,
    metadata.ShipName,
    metadata.Tipo,
    metadata.tipo,
    metadata.tipo_carga,
    metadata.cargoType,
    metadata.cargoTaxonomyLabel,
    metadata.categoryLabel,
    metadata.categoryValue,
    metadata.shipType,
    metadata.ShipType,
    metadata.vesselType,
    metadata.vesselClass,
    metadata.Destination,
    metadata.LastPort,
  ].filter(Boolean).join(" "));
  const reasons: string[] = [];
  CEMENT_CONFIRMED_TERMS.forEach((term) => {
    const normalized = normalizeShipTypeText(term);
    if (["cement", "cemento", "ciment", "clinker"].includes(normalized)) {
      if (new RegExp(`\\b${normalized}\\b`).test(text)) reasons.push(term);
    } else if (text.includes(normalized)) {
      reasons.push(term);
    }
  });
  if (reasons.length > 0) return { level: "confirmed" as const, label: "Cement Carrier", reasons };

  const possibleReasons = CEMENT_POSSIBLE_TERMS.filter((term) => {
    const normalized = normalizeShipTypeText(term);
    if (normalized === "cem") return /\bcem\b/.test(text) || /\bcem[a-z0-9]{2,}\b/.test(text);
    return text.includes(normalized);
  });
  const hasGenericCargoSignal = CEMENT_GENERIC_CARGO_TERMS.some((term) => text.includes(normalizeShipTypeText(term)));
  if (possibleReasons.length > 0 && hasGenericCargoSignal) {
    return { level: "possible" as const, label: "Possible Cement Carrier", reasons: possibleReasons };
  }
  return { level: "none" as const, label: "", reasons: [] };
}

export function isCargoShipType(value: unknown): boolean {
  const code = parseShipTypeCode(value);
  if (code !== null) return code >= 70 && code <= 89;

  const text = normalizeShipTypeText(value);
  if (!text) return false;

  const cargoTerms = [
    "bulk",
    "bulker",
    "cargo",
    "container",
    "cement",
    "general cargo",
    "heavy lift",
    "multipurpose",
    "multi purpose",
    "mpp",
    "ro ro cargo",
    "reefer",
    "freighter",
    "carrier",
    "tanker",
    "crude",
    "chemical",
    "product",
    "oil",
    "lng",
    "lpg",
  ];
  const excludedTerms = [
    "passenger",
    "ferry",
    "cruise",
    "fishing",
    "tug",
    "pilot",
    "yacht",
    "gas",
  ];

  return cargoTerms.some((term) => text.includes(term))
    && !excludedTerms.some((term) => text.includes(term));
}

function estimateDwt(row: VesselRecord): number | null {
  const raw = asRecord(row.rawData);
  const metadata = asRecord(raw.MetaData);
  const direct = toNumber(firstDefined(row.dwt, raw.DWT, raw.dwt, raw.deadweight, metadata.DWT, metadata.dwt, metadata.deadweight));
  if (direct && direct > 0) return Math.round(direct);

  if (!isCargoShipType(row.shipType)) return null;

  const seed = String(firstDefined(row.imoNumber, row.mmsi, row.vesselName, "") || "");
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }
  return 25000 + (Math.abs(hash) % 40001);
}

function classifyCargo(row: VesselRecord, dwt: number | null) {
  const text = normalizeShipTypeText(row.shipType);
  const cementSignal = classifyCementCarrierSignal(row);
  if (cementSignal.level === "confirmed") return "Cement Carrier";
  if (cementSignal.level === "possible") return "Possible Cement Carrier";
  if (text.includes("container")) return "Container";
  if (text.includes("reefer")) return "Reefer";
  if (text.includes("ro ro")) return "Ro-Ro Cargo";
  if (text.includes("cement")) return "Cement Carrier";
  if (text.includes("heavy lift")) return "Heavy Lift";
  if (text.includes("multipurpose") || text.includes("multi purpose") || text.includes("mpp")) return "Multipurpose";
  if (text.includes("bulk") || text.includes("bulker")) return dwt && dwt >= 50000 ? "Supramax Bulk Carrier" : "Handysize Bulk Carrier";
  return "General Cargo";
}

function classifyVessel(row: VesselRecord, dwt: number | null) {
  const text = normalizeShipTypeText(row.shipType);
  if (text.includes("supramax")) return "Supramax";
  if (text.includes("handysize")) return "Handysize";
  if (!dwt) return null;
  if (dwt >= 50000 && dwt <= 65000) return "Supramax";
  if (dwt >= 25000 && dwt < 50000) return "Handysize";
  if (dwt < 25000) return "Small Cargo";
  return "Large Cargo";
}

function inferLoadState(row: VesselRecord) {
  const raw = asRecord(row.rawData);
  const metadata = asRecord(raw.MetaData);
  const explicit = String(firstDefined(row.loadState, raw.loadState, raw.estado_carga, raw.cargoStatus, metadata.loadState, metadata.estado_carga, "") || "").toLowerCase();
  if (explicit.includes("laden") || explicit.includes("carg")) return "Laden";
  if (explicit.includes("ballast") || explicit.includes("vacio") || explicit.includes("vacío")) return "Ballast";

  const designDraft = toNumber(firstDefined(row.designDraft, raw.designDraft, raw.maxDraft, metadata.designDraft, metadata.maxDraft));
  if (row.draught !== null && designDraft && designDraft > 0) return row.draught / designDraft >= 0.62 ? "Laden" : "Ballast";
  if (row.draught !== null) return row.draught >= 8.5 ? "Laden" : "Ballast";
  return row.destination && (row.speed ?? 0) > 0.5 ? "Laden" : null;
}

function missingClassificationData(row: VesselRecord) {
  const missing: string[] = [];
  if (!row.mmsi) missing.push("mmsi");
  if (!row.imoNumber || row.imoNumber.startsWith("MMSI-")) missing.push("imoNumber");
  if (!row.vesselName) missing.push("vesselName");
  if (!row.shipType) missing.push("shipType");
  if (row.draught === null) missing.push("draught");
  if (!row.destination) missing.push("destination");
  if (!row.lastPortOfCall) missing.push("lastPortOfCall");
  if (!row.eta) missing.push("eta");
  if (row.speed === null) missing.push("speed");
  if (row.course === null) missing.push("course");
  return missing;
}

function enrichVesselRecord(row: VesselRecord): VesselRecord {
  const dwt = row.dwt ?? estimateDwt(row);
  const cementCarrierClassification = classifyCementCarrierSignal({ ...row, dwt });
  const cargoClass = row.cargoClass ?? classifyCargo(row, dwt);
  const vesselClass = row.vesselClass ?? classifyVessel(row, dwt);
  const loadState = row.loadState ?? inferLoadState({ ...row, dwt, cargoClass, vesselClass });
  const missingData = missingClassificationData({ ...row, dwt, cargoClass, vesselClass, loadState });
  return {
    ...row,
    dwt,
    cargoClass,
    vesselClass,
    loadState,
    missingData,
    classificationComplete: missingData.length === 0 && Boolean(cargoClass && vesselClass),
    cementCarrierClassification,
    classificationSignals: {
      shipType: row.shipType,
      cargoClass,
      cementCarrierClassification,
      dwt,
      draught: row.draught,
      designDraft: row.designDraft ?? null,
      loadState,
      destination: row.destination,
      lastPortOfCall: row.lastPortOfCall,
      speed: row.speed,
      course: row.course,
    },
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return new Date().toISOString();
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalizeIsoEta(value: string | null): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function cargoLogLine(row: VesselRecord): string {
  return [
    row.mmsi || "",
    row.imoNumber.startsWith("MMSI-") ? "" : row.imoNumber,
    row.vesselName || "",
    row.shipType || "",
    row.draught ?? "",
    row.latitude,
    row.longitude,
    normalizeIsoEta(row.eta),
    normalizeIsoEta(row.estimatedEta ?? null),
    row.estimatedEtaTarget ?? "",
    row.estimatedEtaDistanceNm ?? "",
    row.estimatedEtaSpeedKnots ?? "",
    row.estimatedEtaConfidence ?? "",
  ].map(csvCell).join(",");
}

function vesselStorageKey(row: VesselRecord) {
  if (row.mmsi) return `mmsi:${row.mmsi}`;
  return `imo:${row.imoNumber}`;
}

function mergeVesselRecord(existing: VesselRecord | undefined, incoming: VesselRecord): VesselRecord {
  const now = new Date().toISOString();
  if (!existing) {
    return {
      ...incoming,
      radarSweepCount: incoming.radarSweepCount ?? 1,
      firstSeenAt: incoming.firstSeenAt || incoming.createdAt || now,
      lastSeenAt: incoming.lastSeenAt || now,
      createdAt: incoming.createdAt || now,
      updatedAt: now,
    };
  }

  return {
    ...existing,
    imoNumber: incoming.imoNumber && !incoming.imoNumber.startsWith("MMSI-") ? incoming.imoNumber : existing.imoNumber,
    mmsi: incoming.mmsi ?? existing.mmsi,
    vesselName: incoming.vesselName ?? existing.vesselName,
    shipType: incoming.shipType ?? existing.shipType,
    cargoClass: incoming.cargoClass ?? existing.cargoClass,
    vesselClass: incoming.vesselClass ?? existing.vesselClass,
    dwt: incoming.dwt ?? existing.dwt,
    draught: incoming.draught ?? existing.draught,
    designDraft: incoming.designDraft ?? existing.designDraft,
    loadState: incoming.loadState ?? existing.loadState,
    latitude: incoming.latitude,
    longitude: incoming.longitude,
    speed: incoming.speed ?? existing.speed,
    course: incoming.course ?? existing.course,
    heading: incoming.heading ?? existing.heading,
    navigationalStatus: incoming.navigationalStatus ?? existing.navigationalStatus,
    destination: incoming.destination ?? existing.destination,
    predictedDestination: incoming.predictedDestination ?? existing.predictedDestination,
    predictedDestinationConfidence: incoming.predictedDestinationConfidence ?? existing.predictedDestinationConfidence,
    lastPortOfCall: incoming.lastPortOfCall ?? existing.lastPortOfCall,
    eta: incoming.eta ?? existing.eta,
    estimatedEta: incoming.estimatedEta ?? existing.estimatedEta,
    estimatedEtaTarget: incoming.estimatedEtaTarget ?? existing.estimatedEtaTarget,
    estimatedEtaDistanceNm: incoming.estimatedEtaDistanceNm ?? existing.estimatedEtaDistanceNm,
    estimatedEtaHours: incoming.estimatedEtaHours ?? existing.estimatedEtaHours,
    estimatedEtaSpeedKnots: incoming.estimatedEtaSpeedKnots ?? existing.estimatedEtaSpeedKnots,
    estimatedEtaConfidence: incoming.estimatedEtaConfidence ?? existing.estimatedEtaConfidence,
    source: incoming.source,
    rawData: incoming.rawData,
    classificationSignals: incoming.classificationSignals,
    cementCarrierClassification: incoming.cementCarrierClassification ?? existing.cementCarrierClassification,
    missingData: incoming.missingData,
    classificationComplete: incoming.classificationComplete ?? existing.classificationComplete ?? false,
    radarSweepCount: (existing.radarSweepCount ?? 0) + 1,
    firstSeenAt: existing.firstSeenAt || existing.createdAt || incoming.firstSeenAt || incoming.createdAt || now,
    lastSeenAt: incoming.lastSeenAt || now,
    createdAt: existing.createdAt || incoming.createdAt || now,
    updatedAt: now,
  };
}

async function readVesselIndex(): Promise<VesselRecord[]> {
  try {
    const store = getVesselStore();
    const data = await store.get(VESSEL_INDEX_KEY, { type: "json" });
    
    if (Array.isArray(data)) {
      return data.filter(isVesselRecord);
    }
  } catch (error) {
    console.warn("AIS vessel store index read failed:", error);
  }
  return [];
}

async function writeVesselIndex(rows: VesselRecord[]): Promise<void> {
  await getVesselStore().setJSON(VESSEL_INDEX_KEY, rows.slice(0, 45000), {
    metadata: {
      contentType: "application/json; charset=utf-8",
      purpose: "classified-radar-vessel-index",
    },
  });
}

export async function readVessels(): Promise<VesselRecord[]> {
  return sortByLastSeen(await readVesselIndex()).slice(0, 45000);
}

export async function upsertVessels(rows: VesselRecord[]): Promise<VesselRecord[]> {
  const cargoRows = rows.filter((row) => isCargoShipType(row.shipType)).map(enrichVesselRecord);
  if (cargoRows.length === 0) return readVessels();

  const currentRows = await readVesselIndex();
  const rowsByKey = new Map<string, VesselRecord>();

  for (const row of currentRows) {
    rowsByKey.set(vesselStorageKey(row), row);
  }

  for (const row of cargoRows) {
    const primaryKey = vesselStorageKey(row);
    const existingByPrimary = rowsByKey.get(primaryKey);
    const existingByImo = row.mmsi ? rowsByKey.get(`imo:${row.imoNumber}`) : undefined;
    const merged = mergeVesselRecord(existingByPrimary || existingByImo, row);
    rowsByKey.set(vesselStorageKey(merged), merged);
    if (existingByImo && vesselStorageKey(existingByImo) !== vesselStorageKey(merged)) {
      rowsByKey.delete(vesselStorageKey(existingByImo));
    }
  }

  await writeVesselIndex(sortByLastSeen(Array.from(rowsByKey.values())));
  await appendCargoVesselCsvLog(cargoRows);

  return readVessels();
}

export async function appendCargoVesselCsvLog(rows: VesselRecord[]): Promise<void> {
  const cargoRows = rows.filter((row) => isCargoShipType(row.shipType));
  if (cargoRows.length === 0) return;

  const store = getVesselStore();
  const existing = await store.get(CARGO_LOG_KEY, { type: "text" });
  const prefix = existing && existing.trim().length > 0 ? existing.replace(/\s*$/, "\n") : `${CARGO_LOG_HEADER}\n`;
  const next = `${prefix}${cargoRows.map(cargoLogLine).join("\n")}\n`;
  await store.set(CARGO_LOG_KEY, next, {
    metadata: {
      contentType: "text/csv; charset=utf-8",
      purpose: "filtered-cargo-ais-log",
    },
  });
}

export function sortByLastSeen(rows: VesselRecord[]) {
  return [...rows].sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}
