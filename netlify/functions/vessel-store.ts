import { getStore } from "@netlify/blobs";

export type VesselRecord = {
  imoNumber: string;
  mmsi: string | null;
  vesselName: string | null;
  shipType: string | null;
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

function getVesselStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function isVesselRecord(value: unknown): value is VesselRecord {
  const vessel = value && typeof value === "object" ? value as Partial<VesselRecord> : {};
  return typeof vessel.imoNumber === "string"
    && Number.isFinite(vessel.latitude)
    && Number.isFinite(vessel.longitude);
}

export async function readVessels(): Promise<VesselRecord[]> {
  const store = getVesselStore();
  const stored = await store.get(VESSELS_KEY, { type: "json" });

  if (!Array.isArray(stored)) return [];

  return stored.filter(isVesselRecord);
}

export async function upsertVessels(rows: VesselRecord[]): Promise<VesselRecord[]> {
  if (rows.length === 0) return readVessels();

  const existing = await readVessels();
  const byKey = new Map(existing.map((row) => [row.mmsi || row.imoNumber, row]));

  for (const row of rows) {
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
      createdAt: previous?.createdAt || row.createdAt,
      updatedAt: new Date().toISOString(),
    });
  }

  const nextRows = Array.from(byKey.values())
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

  await getVesselStore().setJSON(VESSELS_KEY, nextRows);

  return nextRows;
}

export function sortByLastSeen(rows: VesselRecord[]) {
  return [...rows].sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}
