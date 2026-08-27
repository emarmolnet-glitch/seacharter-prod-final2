import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, ensureApplicationSchema } from "../../db/index.js";
import { charterDossiers } from "../../db/schema.js";

const MAX_PAYLOAD_BYTES = 4_000_000;
const VALID_STATUSES = new Set(["BORRADOR", "COTIZADO", "FIJADO"]);

function accountKey(req: Request, body?: Record<string, unknown>) {
  return String(req.headers.get("x-seacharter-account") || body?.accountKey || "default-account").trim() || "default-account";
}

function cleanText(value: unknown, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function normalizeStatus(value: unknown) {
  const status = cleanText(value, 20).toUpperCase();
  return VALID_STATUSES.has(status) ? status : "BORRADOR";
}

function dossierIdFromUrl(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const routeIndex = parts.lastIndexOf("dossiers");
  return routeIndex >= 0 ? parts[routeIndex + 1] || "" : "";
}

function serialize(row: typeof charterDossiers.$inferSelect, includePayload = false) {
  return {
    id: row.id,
    reference: row.reference,
    pol: row.pol || "",
    pod: row.pod || "",
    cargoName: row.cargoName || "",
    cargoVolume: row.cargoVolume || 0,
    charterer: row.charterer || "",
    internalNotes: row.internalNotes || "",
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(includePayload ? { sessionPayload: row.sessionPayload } : {}),
  };
}

function generateReference() {
  const year = new Date().getUTCFullYear();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `RDM/${year}-${suffix}`;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const id = dossierIdFromUrl(url);

  try {
    await ensureApplicationSchema();

    if (req.method === "GET" && id) {
      const key = accountKey(req);
      const [row] = await db.select().from(charterDossiers)
        .where(and(eq(charterDossiers.id, id), eq(charterDossiers.accountKey, key))).limit(1);
      if (!row) return Response.json({ success: false, error: "Dossier not found" }, { status: 404 });
      return Response.json({ success: true, dossier: serialize(row, true) });
    }

    if (req.method === "GET") {
      const key = accountKey(req);
      const query = cleanText(url.searchParams.get("q"), 120);
      const filters = [eq(charterDossiers.accountKey, key)];
      if (query) {
        filters.push(or(
          ilike(charterDossiers.reference, `%${query}%`),
          ilike(charterDossiers.pol, `%${query}%`),
          ilike(charterDossiers.pod, `%${query}%`),
          ilike(charterDossiers.cargoName, `%${query}%`),
          ilike(charterDossiers.charterer, `%${query}%`),
        )!);
      }
      const rows = await db.select().from(charterDossiers)
        .where(and(...filters)).orderBy(desc(charterDossiers.updatedAt)).limit(250);
      return Response.json({ success: true, dossiers: rows.map((row) => serialize(row)) });
    }

    if (!["POST", "PUT", "PATCH"].includes(req.method)) {
      return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    const key = accountKey(req, body);

    if (req.method === "PATCH" && id) {
      const [row] = await db.update(charterDossiers)
        .set({ status: normalizeStatus(body.status), updatedAt: new Date() })
        .where(and(eq(charterDossiers.id, id), eq(charterDossiers.accountKey, key)))
        .returning();
      if (!row) return Response.json({ success: false, error: "Dossier not found" }, { status: 404 });
      return Response.json({ success: true, dossier: serialize(row) });
    }

    const sessionPayload = body.sessionPayload;
    if (!sessionPayload || typeof sessionPayload !== "object" || Array.isArray(sessionPayload)) {
      return Response.json({ success: false, error: "sessionPayload must be an object" }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(sessionPayload), "utf8") > MAX_PAYLOAD_BYTES) {
      return Response.json({ success: false, error: "Dossier payload is too large" }, { status: 413 });
    }

    const values = {
      accountKey: key,
      reference: cleanText(body.reference, 80) || generateReference(),
      pol: cleanText(body.pol),
      pod: cleanText(body.pod),
      cargoName: cleanText(body.cargoName),
      cargoVolume: Number(body.cargoVolume) || 0,
      charterer: cleanText(body.charterer),
      internalNotes: cleanText(body.internalNotes, 4000),
      status: normalizeStatus(body.status),
      sessionPayload,
      updatedAt: new Date(),
    };

    if (req.method === "PUT" && id) {
      const [row] = await db.update(charterDossiers).set(values)
        .where(and(eq(charterDossiers.id, id), eq(charterDossiers.accountKey, key))).returning();
      if (!row) return Response.json({ success: false, error: "Dossier not found" }, { status: 404 });
      return Response.json({ success: true, dossier: serialize(row, true) });
    }

    const [row] = await db.insert(charterDossiers).values(values)
      .onConflictDoUpdate({
        target: [charterDossiers.accountKey, charterDossiers.reference],
        set: values,
      }).returning();
    return Response.json({ success: true, dossier: serialize(row, true) }, { status: 201 });
  } catch (error) {
    console.error("[dossiers] Request failed.", error);
    return Response.json({ success: false, error: "Dossier operation failed" }, { status: 500 });
  }
};
