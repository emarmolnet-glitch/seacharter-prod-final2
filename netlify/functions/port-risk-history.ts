import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type RiskPayload = {
  portName?: unknown;
  deltaDias?: unknown;
  climaDias?: unknown;
  fondeoDias?: unknown;
};

type PortRiskRow = {
  portKey: string;
  portName: string;
  avg_delta_dias: number;
  avg_clima_dias: number;
  avg_fondeo_dias: number;
  n_viajes: number;
  last_voyage_at: string | null;
};

type PortRiskHistory = Record<string, PortRiskRow>;

const STORE_NAME = "port-risk-history";
const HISTORY_KEY = "learned-port-risks";

function normalizePortKey(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function toNonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function serializeRow(row: PortRiskRow) {
  return {
    portKey: row.portKey,
    portName: row.portName,
    avg_delta_dias: Number(row.avg_delta_dias || 0),
    avg_clima_dias: Number(row.avg_clima_dias || 0),
    avg_fondeo_dias: Number(row.avg_fondeo_dias || 0),
    n_viajes: Number(row.n_viajes || 0),
    last_voyage_at: row.last_voyage_at,
  };
}

function getRiskStore() {
  return getStore({
    name: STORE_NAME,
    consistency: "strong",
  });
}

async function readHistory(): Promise<PortRiskHistory> {
  const store = getRiskStore();
  const history = await store.get(HISTORY_KEY, { type: "json" });
  return history && typeof history === "object" && !Array.isArray(history)
    ? (history as PortRiskHistory)
    : {};
}

async function writeHistory(history: PortRiskHistory) {
  const store = getRiskStore();
  await store.setJSON(HISTORY_KEY, history);
}

async function getRows(portNames: unknown[]) {
  const keys = Array.from(new Set(portNames.map(normalizePortKey).filter(Boolean)));
  if (!keys.length) return [];

  const history = await readHistory();
  const rows = keys.map((key) => history[key]).filter(Boolean);
  return rows.map(serializeRow);
}

async function learnPort(payload: RiskPayload) {
  const portName = String(payload.portName || "").trim();
  const portKey = normalizePortKey(portName);
  if (!portKey) {
    return Response.json({ error: "portName is required" }, { status: 400 });
  }

  const realDelta = toNonNegativeNumber(payload.deltaDias);
  const realClima = toNonNegativeNumber(payload.climaDias);
  const realFondeo = toNonNegativeNumber(payload.fondeoDias);
  const history = await readHistory();
  const current = history[portKey];
  const currentTrips = Number(current?.n_viajes || 0);
  const nextTrips = currentTrips + 1;
  const now = new Date().toISOString();
  const row: PortRiskRow = {
    portKey,
    portName,
    avg_delta_dias: Number((((current?.avg_delta_dias || 0) * currentTrips + realDelta) / nextTrips).toFixed(4)),
    avg_clima_dias: Number((((current?.avg_clima_dias || 0) * currentTrips + realClima) / nextTrips).toFixed(4)),
    avg_fondeo_dias: Number((((current?.avg_fondeo_dias || 0) * currentTrips + realFondeo) / nextTrips).toFixed(4)),
    n_viajes: nextTrips,
    last_voyage_at: now,
  };
  history[portKey] = row;
  await writeHistory(history);

  return serializeRow(row);
}

export default async (req: Request) => {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      return Response.json({ ports: await getRows(url.searchParams.getAll("port")) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const records = Array.isArray(body?.records) ? body.records : [body];
      const learned = [];
      let status = 200;

      for (const record of records) {
        const result = await learnPort(record);
        if (result instanceof Response) return result;
        if (Number(result.n_viajes) === 1) status = 201;
        learned.push(result);
      }

      return Response.json({ ports: learned }, { status });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("[port-risk-history] Request failed.", error);
    return Response.json({ error: "Port risk history request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/port-risk-history",
};
