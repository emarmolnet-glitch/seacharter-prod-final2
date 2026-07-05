import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonHeaders = {
  ...corsHeaders,
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function readFirst(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = cleanText(source[key]);
    if (value) return value;
  }
  return "";
}

function normalizeVessel(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const imo = readFirst(source, ["imo", "IMO", "imoNumber", "numeroIMO"]);
  const mmsi = readFirst(source, ["mmsi", "MMSI"]);
  const name = readFirst(source, ["nombre", "name", "vesselName", "ShipName", "shipName"]);
  const eta = readFirst(source, ["eta", "ETA", "estimatedArrival", "arrivalEta"]);

  if (!imo && !mmsi && !name) return null;

  return {
    imo: imo || "N/A",
    mmsi: mmsi || null,
    name: name || "Unknown vessel",
    eta: eta || null,
    status: "pending_audit",
    source: "Core PRO",
    payload: source,
  };
}

function getVesselsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.vessels)) return source.vessels;
  if (Array.isArray(source.buques)) return source.buques;
  if (Array.isArray(source.selectedVessels)) return source.selectedVessels;
  return [];
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
  }

  let payload: unknown;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: "Invalid JSON body" }),
    };
  }

  const vessels = getVesselsFromPayload(payload)
    .map(normalizeVessel)
    .filter((vessel): vessel is NonNullable<ReturnType<typeof normalizeVessel>> => vessel !== null);

  if (vessels.length === 0) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: "No valid vessels were provided" }),
    };
  }

  const source = cleanText((payload as Record<string, unknown> | null)?.source) || "Core PRO";
  const receivedAt = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const store = getStore("audit-receiver");

  const batch = {
    id: batchId,
    source,
    vesselCount: vessels.length,
    payload: payload as Record<string, unknown>,
    receivedAt,
  };

  const insertedVessels = vessels.map((vessel) => ({
    id: crypto.randomUUID(),
    batchId,
    ...vessel,
    source,
    receivedAt,
  }));

  await Promise.all([
    store.setJSON(`batches/${batchId}.json`, batch),
    ...insertedVessels.map((vessel) =>
      store.setJSON(`vessels/${batchId}/${vessel.id}.json`, vessel),
    ),
  ]);

  return {
    statusCode: 201,
    headers: jsonHeaders,
    body: JSON.stringify({
      success: true,
      status: "success",
      action: "pending_audit",
      batchId: batch.id,
      acceptedAt: receivedAt,
      acceptedCount: insertedVessels.length,
      vessels: insertedVessels.map((vessel) => ({
        id: vessel.id,
        imo: vessel.imo,
        mmsi: vessel.mmsi,
        nombre: vessel.name,
        name: vessel.name,
        eta: vessel.eta,
        status: vessel.status,
      })),
    }),
  };
};
