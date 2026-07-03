import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type CoaSnapshotPayload = {
  voyage?: {
    vesselName?: unknown;
    imo?: unknown;
    pol?: unknown;
    pod?: unknown;
    etaBaseRadar?: unknown;
  };
  bunkerIndex?: {
    date?: unknown;
  };
  coa?: {
    targetPrice?: unknown;
  };
};

type CoaSnapshotRecord = {
  id: string;
  voyageRef: string;
  vesselName: string | null;
  imo: string | null;
  pol: string | null;
  pod: string | null;
  etaBaseRadar: string | null;
  bunkerIndexDate: string | null;
  targetPrice: string | null;
  payload: CoaSnapshotPayload;
  createdAt: string;
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function buildVoyageRef(payload: CoaSnapshotPayload) {
  const voyage = payload.voyage || {};
  const route = [voyage.pol, voyage.pod].map(cleanString).filter(Boolean).join("-");
  const vessel = cleanString(voyage.vesselName) || "TBN";
  return `${vessel}${route ? ` ${route}` : ""} ${new Date().toISOString()}`.slice(0, 240);
}

function buildRecord(payload: CoaSnapshotPayload): CoaSnapshotRecord {
  const voyage = payload.voyage || {};
  const createdAt = new Date().toISOString();
  const randomPart = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return {
    id: `coa-${createdAt}-${randomPart}`,
    voyageRef: buildVoyageRef(payload),
    vesselName: cleanString(voyage.vesselName) || null,
    imo: cleanString(voyage.imo) || null,
    pol: cleanString(voyage.pol) || null,
    pod: cleanString(voyage.pod) || null,
    etaBaseRadar: cleanString(voyage.etaBaseRadar) || null,
    bunkerIndexDate: cleanString(payload.bunkerIndex?.date) || null,
    targetPrice: cleanString(payload.coa?.targetPrice) || null,
    payload,
    createdAt,
  };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const payload = await req.json().catch(() => null) as CoaSnapshotPayload | null;
    if (!payload || typeof payload !== "object") {
      return Response.json({ success: false, error: "A COA snapshot payload is required" }, { status: 400 });
    }

    const saved = buildRecord(payload);
    const store = getStore("coa-snapshots");
    await store.setJSON(`${saved.createdAt.slice(0, 10)}/${saved.id}.json`, saved);

    return Response.json({
      success: true,
      snapshot: {
        id: saved.id,
        voyageRef: saved.voyageRef,
        createdAt: saved.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[coa-snapshot] Request failed.", error);
    return Response.json({ success: false, error: "COA snapshot request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/coa-snapshot",
};
