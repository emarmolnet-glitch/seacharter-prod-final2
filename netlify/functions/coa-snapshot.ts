import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type CoaSnapshotPayload = {
  voyage?: {
    vesselName?: unknown;
    imo?: unknown;
    pol?: unknown;
    pod?: unknown;
    laycanDate?: unknown;
    laycanTime?: unknown;
    cancellingDate?: unknown;
    cancellingTime?: unknown;
    etaBaseRadar?: unknown;
  };
  bunkerIndex?: {
    date?: unknown;
  };
  coa?: {
    targetPrice?: unknown;
  };
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function cleanNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? Number(next.toFixed(4)) : null;
}

function buildVoyageRef(payload: CoaSnapshotPayload) {
  const voyage = payload.voyage || {};
  const route = [voyage.pol, voyage.pod].map(cleanString).filter(Boolean).join("-");
  const vessel = cleanString(voyage.vesselName) || "TBN";
  return `${vessel}${route ? ` ${route}` : ""} ${new Date().toISOString()}`.slice(0, 240);
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

    const createdAt = new Date();
    const voyage = payload.voyage || {};
    const id = globalThis.crypto?.randomUUID
      ? `coa-${globalThis.crypto.randomUUID()}`
      : `coa-${createdAt.toISOString()}-${Math.random().toString(36).slice(2)}`;
    const voyageRef = buildVoyageRef(payload);

    const snapshot = {
      id,
      voyageRef,
      vesselName: cleanString(voyage.vesselName) || null,
      imo: cleanString(voyage.imo) || null,
      pol: cleanString(voyage.pol) || null,
      pod: cleanString(voyage.pod) || null,
      laycanDate: cleanString(voyage.laycanDate) || null,
      laycanTime: cleanString(voyage.laycanTime) || null,
      cancellingDate: cleanString(voyage.cancellingDate) || null,
      cancellingTime: cleanString(voyage.cancellingTime) || null,
      etaBaseRadar: cleanString(voyage.etaBaseRadar) || null,
      bunkerIndexDate: cleanString(payload.bunkerIndex?.date) || null,
      targetPrice: cleanNumber(payload.coa?.targetPrice),
      payload,
      createdAt: createdAt.toISOString(),
    };
    const store = getStore("coa-snapshots");
    await store.setJSON(`${createdAt.toISOString().slice(0, 10)}/${id}.json`, snapshot);

    return Response.json({
      success: true,
      snapshot: {
        id,
        voyageRef,
        createdAt: createdAt.toISOString(),
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
