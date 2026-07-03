import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type VoyageArchivePayload = {
  voyage?: {
    vesselName?: unknown;
    imo?: unknown;
    pol?: unknown;
    pod?: unknown;
    etaBaseRadar?: unknown;
    etaFinalCalculada?: unknown;
  };
};

type VoyageArchiveRecord = {
  id: string;
  voyageRef: string;
  vesselName: string | null;
  imo: string | null;
  pol: string | null;
  pod: string | null;
  etaBaseRadar: string | null;
  etaFinalCalculated: string | null;
  payload: VoyageArchivePayload;
  createdAt: string;
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function buildVoyageRef(payload: VoyageArchivePayload) {
  const voyage = payload.voyage || {};
  const route = [voyage.pol, voyage.pod].map(cleanString).filter(Boolean).join("-");
  const vessel = cleanString(voyage.vesselName) || "TBN";
  return `${vessel}${route ? ` ${route}` : ""} ${new Date().toISOString()}`.slice(0, 240);
}

function buildRecord(payload: VoyageArchivePayload): VoyageArchiveRecord {
  const voyage = payload.voyage || {};
  const createdAt = new Date().toISOString();
  const randomPart = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return {
    id: `voyage-${createdAt}-${randomPart}`,
    voyageRef: buildVoyageRef(payload),
    vesselName: cleanString(voyage.vesselName) || null,
    imo: cleanString(voyage.imo) || null,
    pol: cleanString(voyage.pol) || null,
    pod: cleanString(voyage.pod) || null,
    etaBaseRadar: cleanString(voyage.etaBaseRadar) || null,
    etaFinalCalculated: cleanString(voyage.etaFinalCalculada) || null,
    payload,
    createdAt,
  };
}

export default async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const payload = await req.json().catch(() => null) as VoyageArchivePayload | null;
    if (!payload || typeof payload !== "object") {
      return Response.json({ success: false, error: "A voyage archive payload is required" }, { status: 400 });
    }

    const saved = buildRecord(payload);
    const store = getStore("voyage-archives");
    await store.setJSON(`${saved.createdAt.slice(0, 10)}/${saved.id}.json`, saved);

    return Response.json({
      success: true,
      voyage: {
        id: saved.id,
        voyageRef: saved.voyageRef,
        createdAt: saved.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[voyage-archive] Request failed.", error);
    return Response.json({ success: false, error: "Voyage archive request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/voyage-archive",
};
