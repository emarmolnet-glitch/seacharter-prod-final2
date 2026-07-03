import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

type CoaClientProfile = {
  id: number;
  profileName: string;
  clientName: string;
  ownerMarginPercent: string;
  chartererMarginPercent: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedProfiles = [
  { id: 1, profileName: "Cliente_Spot", clientName: "Cliente Spot", ownerMarginPercent: "15.000", chartererMarginPercent: "10.000", isDefault: true },
  { id: 2, profileName: "Cliente_COA_Premium", clientName: "Cliente COA Premium", ownerMarginPercent: "12.000", chartererMarginPercent: "7.500", isDefault: false },
  { id: 3, profileName: "Cliente_Frecuente", clientName: "Cliente Frecuente", ownerMarginPercent: "13.500", chartererMarginPercent: "8.500", isDefault: false },
];

function cleanText(value: unknown, fallback = "") {
  const next = String(value || "").trim();
  return next || fallback;
}

function cleanPercent(value: unknown, fallback: number) {
  const next = Number(value);
  const normalized = Number.isFinite(next) ? Math.min(95, Math.max(0, next)) : fallback;
  return normalized.toFixed(3);
}

function withTimestamps(profile: typeof seedProfiles[number], timestamp: string): CoaClientProfile {
  return {
    ...profile,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function readProfiles() {
  const store = getStore("coa-client-profiles");
  const profiles = await store.get("profiles.json", { type: "json" }) as CoaClientProfile[] | null;
  if (Array.isArray(profiles) && profiles.length) {
    return profiles;
  }

  const seededAt = new Date().toISOString();
  const seeded = seedProfiles.map((profile) => withTimestamps(profile, seededAt));
  await store.setJSON("profiles.json", seeded);
  return seeded;
}

async function writeProfiles(profiles: CoaClientProfile[]) {
  const store = getStore("coa-client-profiles");
  await store.setJSON("profiles.json", profiles);
}

function sortProfiles(profiles: CoaClientProfile[]) {
  return [...profiles].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.profileName.localeCompare(b.profileName);
  });
}

export default async (req: Request) => {
  try {
    if (req.method === "GET") {
      return Response.json({ success: true, profiles: sortProfiles(await readProfiles()) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const profiles = await readProfiles();
      const profileName = cleanText(body.profileName || body.clientName, "Cliente_COA");
      const clientName = cleanText(body.clientName || body.profileName, profileName);
      const now = new Date().toISOString();
      const existingIndex = profiles.findIndex((profile) => profile.profileName === profileName);
      const profile = existingIndex >= 0
        ? {
          ...profiles[existingIndex],
          clientName,
          ownerMarginPercent: cleanPercent(body.ownerMarginPercent, 15),
          chartererMarginPercent: cleanPercent(body.chartererMarginPercent, 10),
          isDefault: Boolean(body.isDefault),
          updatedAt: now,
        }
        : {
          id: profiles.reduce((max, item) => Math.max(max, item.id), 0) + 1,
          profileName,
          clientName,
          ownerMarginPercent: cleanPercent(body.ownerMarginPercent, 15),
          chartererMarginPercent: cleanPercent(body.chartererMarginPercent, 10),
          isDefault: Boolean(body.isDefault),
          createdAt: now,
          updatedAt: now,
        };
      if (existingIndex >= 0) profiles[existingIndex] = profile;
      else profiles.push(profile);
      await writeProfiles(profiles);
      return Response.json({ success: true, profile }, { status: 201 });
    }

    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return Response.json({ success: false, error: "A valid profile id is required" }, { status: 400 });
      }
      const profiles = await readProfiles();
      const index = profiles.findIndex((profile) => profile.id === id);
      if (index < 0) {
        return Response.json({ success: false, error: "Profile not found" }, { status: 404 });
      }
      const profile = {
        ...profiles[index],
        profileName: cleanText(body.profileName, "Cliente_COA"),
        clientName: cleanText(body.clientName, "Cliente COA"),
        ownerMarginPercent: cleanPercent(body.ownerMarginPercent, 15),
        chartererMarginPercent: cleanPercent(body.chartererMarginPercent, 10),
        isDefault: Boolean(body.isDefault),
        updatedAt: new Date().toISOString(),
      };
      profiles[index] = profile;
      await writeProfiles(profiles);
      return Response.json({ success: true, profile });
    }

    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("[coa-client-profiles] Request failed.", error);
    return Response.json({ success: false, error: "COA client profile request failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/coa-client-profiles",
};

export async function saveTemporaryAdjustment(payload: {
  clientProfileId?: number | null;
  voyageRef: string;
  ownerMarginPercent: number;
  chartererMarginPercent: number;
}) {
  const createdAt = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${createdAt}-${Math.random().toString(36).slice(2)}`;
  const store = getStore("coa-temporary-adjustments");
  await store.setJSON(`${createdAt.slice(0, 10)}/${id}.json`, {
    id,
    clientProfileId: payload.clientProfileId || null,
    voyageRef: payload.voyageRef,
    ownerMarginPercent: cleanPercent(payload.ownerMarginPercent, 15),
    chartererMarginPercent: cleanPercent(payload.chartererMarginPercent, 10),
    reason: "Ajuste Temporal",
    createdAt,
  });
}
