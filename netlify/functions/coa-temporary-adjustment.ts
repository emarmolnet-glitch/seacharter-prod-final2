import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

function cleanPercent(value: unknown) {
  const next = Number(value);
  return (Number.isFinite(next) ? Math.min(95, Math.max(0, next)) : 0).toFixed(3);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const voyageRef = String(body.voyageRef || "").trim() || `TEMP-${new Date().toISOString()}`;
    const createdAt = new Date().toISOString();
    const id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${createdAt}-${Math.random().toString(36).slice(2)}`;
    const adjustment = {
      id,
      clientProfileId: Number.isInteger(Number(body.clientProfileId)) ? Number(body.clientProfileId) : null,
      voyageRef,
      ownerMarginPercent: cleanPercent(body.ownerMarginPercent),
      chartererMarginPercent: cleanPercent(body.chartererMarginPercent),
      reason: "Ajuste Temporal",
      createdAt,
    };
    const store = getStore("coa-temporary-adjustments");
    await store.setJSON(`${createdAt.slice(0, 10)}/${id}.json`, adjustment);

    return Response.json({ success: true, adjustment }, { status: 201 });
  } catch (error) {
    console.error("[coa-temporary-adjustment] Request failed.", error);
    return Response.json({ success: false, error: "COA temporary adjustment request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/coa-temporary-adjustment",
};
