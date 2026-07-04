import { getStore } from "@netlify/blobs";

export type VesselRecord = {
  imoNumber: string;
  mmsi: string | null;
  vesselName: string | null;
  shipType: string | null;
  draught: number | null;
  latitude: number;
  longitude: number;
  speed: number | null;
  course: number | null;
  heading: number | null;
  navigationalStatus: string | null;
  destination: string | null;
  lastPortOfCall: string | null;
  eta: string | null;
  source: string;
  rawData: unknown;
  lastSeenAt: string;
  updatedAt: string;
  createdAt: string;
};

const STORE_NAME = "ais-vessels";
const VESSELS_KEY = "vessels-master";
const CARGO_LOG_KEY = "cargo-vessels-log.csv";
const CARGO_LOG_HEADER = "MMSI,IMO,Nombre,ShipType,Draught,Latitud,Longitud,ETA";

function getVesselStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function isVesselRecord(value: unknown): value is VesselRecord {
  const vessel = value && typeof value === "object" ? value as Partial<VesselRecord> : {};
  return typeof vessel.imoNumber === "string"
    && Number.isFinite(vessel.latitude)
    && Number.isFinite(vessel.longitude);
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

export function isCargoShipType(value: unknown): boolean {
  const code = parseShipTypeCode(value);
  return code !== null && code >= 70 && code <= 79;
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
  ].map(csvCell).join(",");
}

export async function readVessels(): Promise<VesselRecord[]> {
  const store = getVesselStore();
  const stored = await store.get(VESSELS_KEY, { type: "json" });

  if (!Array.isArray(stored)) return [];

  return stored.filter(isVesselRecord);
}

export async function upsertVessels(rows: VesselRecord[]): Promise<VesselRecord[]> {
  const cargoRows = rows.filter((row) => isCargoShipType(row.shipType));
  if (cargoRows.length === 0) return readVessels();

  const existing = await readVessels();
  const byKey = new Map(existing.map((row) => [row.mmsi || row.imoNumber, row]));

  for (const row of cargoRows) {
    const key = row.mmsi || row.imoNumber;
    const previous = byKey.get(key);
    const incomingHasImo = row.imoNumber && !row.imoNumber.startsWith("MMSI-");
    const previousHasImo = previous?.imoNumber && !previous.imoNumber.startsWith("MMSI-");
    byKey.set(key, {
      ...previous,
      ...row,
      imoNumber: incomingHasImo ? row.imoNumber : (previousHasImo ? previous.imoNumber : row.imoNumber),
      destination: row.destination || previous?.destination || null,
      eta: row.eta || previous?.eta || null,
      draught: row.draught ?? previous?.draught ?? null,
      createdAt: previous?.createdAt || row.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  const nextRows = Array.from(byKey.values())
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

  await getVesselStore().setJSON(VESSELS_KEY, nextRows);
  await appendCargoVesselCsvLog(cargoRows);

  return nextRows;
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
