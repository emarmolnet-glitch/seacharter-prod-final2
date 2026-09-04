import type { Config, Context } from "@netlify/functions";
import { and, desc, eq, sql } from "drizzle-orm";
import { netlifyDb } from "../../db/netlify.js";
import { laytimeStatements } from "../../db/schema.js";
import { calculateLaytime } from "../../laytime-engine.mjs";
import { neon } from "@neondatabase/serverless";

const CONTRACT_PATTERN = /^[A-Z0-9][A-Z0-9/_-]{2,79}$/;
const OPERATIONS = new Set(["LOAD", "DISCHARGE"]);

type StatementBody = Record<string, any>;

function resolveDatabaseUrl() {
  return process.env.DATABASE_URL_WRITE
    || process.env.DATABASE_WRITE_URL
    || process.env.DATABASE_URL
    || process.env.NEON_DATABASE_URL
    || process.env.NETLIFY_DB_URL;
}

async function ensureTableExists() {
  const url = resolveDatabaseUrl();
  if (!url) return;
  const sqlClient = neon(url);
  await sqlClient`
    CREATE TABLE IF NOT EXISTS laytime_statements (
      id SERIAL PRIMARY KEY,
      contract_ref VARCHAR(255) NOT NULL,
      operation VARCHAR(50) NOT NULL,
      quantity_mt NUMERIC DEFAULT 0,
      rate_mt_day NUMERIC,
      allowed_hours NUMERIC,
      laytime_rule VARCHAR(50),
      weather_permitting BOOLEAN DEFAULT true,
      once_on_demurrage BOOLEAN DEFAULT true,
      commencement_delay_minutes INTEGER DEFAULT 0,
      port_time_zone VARCHAR(50),
      demurrage_rate_usd_day NUMERIC DEFAULT 0,
      nor_tendered_at TIMESTAMP,
      nor_accepted_at TIMESTAMP,
      laytime_commenced_at TIMESTAMP,
      operation_started_at TIMESTAMP,
      operation_completed_at TIMESTAMP,
      statement_as_of_at TIMESTAMP,
      incidents JSONB DEFAULT '[]'::jsonb,
      calculation JSONB DEFAULT '{}'::jsonb,
      status VARCHAR(50),
      allowed_seconds INTEGER DEFAULT 0,
      used_seconds INTEGER DEFAULT 0,
      excluded_seconds INTEGER DEFAULT 0,
      balance_seconds INTEGER DEFAULT 0,
      demurrage_usd NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await sqlClient`CREATE INDEX IF NOT EXISTS idx_laytime_contract ON laytime_statements (UPPER(contract_ref));`;
}

function responseError(status: number, error: string, details?: unknown) {
  return Response.json({ success: false, error, ...(details ? { details } : {}) }, { status });
}

function contractRefFromRequest(request: Request, context: Context) {
  const fromPath = String(context.params?.ref || "").trim();
  const pathParts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(fromPath || pathParts.at(-1) || "").trim().toUpperCase();
}

function cleanTimestamp(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanNumber(value: unknown, fallback: number | null = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeStatement(row: typeof laytimeStatements.$inferSelect) {
  return {
    id: row.id,
    contractRef: row.contractRef,
    operation: row.operation,
    quantityMt: row.quantityMt,
    rateMtDay: row.rateMtDay,
    allowedHours: row.allowedHours,
    laytimeRule: row.laytimeRule,
    weatherPermitting: row.weatherPermitting,
    onceOnDemurrage: row.onceOnDemurrage,
    commencementDelayMinutes: row.commencementDelayMinutes,
    portTimeZone: row.portTimeZone,
    demurrageRateUsdDay: row.demurrageRateUsdDay,
    norTenderedAt: row.norTenderedAt,
    norAcceptedAt: row.norAcceptedAt,
    laytimeCommencedAt: row.laytimeCommencedAt,
    operationStartedAt: row.operationStartedAt,
    operationCompletedAt: row.operationCompletedAt,
    statementAsOfAt: row.statementAsOfAt,
    incidents: row.incidents,
    calculation: row.calculation,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

async function getStatements(contractRef: string, request: Request) {
  const operation = String(new URL(request.url).searchParams.get("operation") || "").toUpperCase();
  const conditions = [sql`upper(${laytimeStatements.contractRef}) = ${contractRef}`];
  if (OPERATIONS.has(operation)) conditions.push(eq(laytimeStatements.operation, operation));
  const rows = await netlifyDb
    .select()
    .from(laytimeStatements)
    .where(and(...conditions))
    .orderBy(desc(laytimeStatements.updatedAt));
  return Response.json({ success: true, contractRef, statements: rows.map(serializeStatement) });
}

async function saveStatement(contractRef: string, body: StatementBody) {
  const operation = String(body.operation || "").toUpperCase();
  if (!OPERATIONS.has(operation)) return responseError(400, "operation debe ser LOAD o DISCHARGE.");

  const quantityMt = cleanNumber(body.quantityMt, 0) || 0;
  const rateMtDay = cleanNumber(body.rateMtDay);
  const allowedHours = cleanNumber(body.allowedHours);
  const demurrageRateUsdDay = cleanNumber(body.demurrageRateUsdDay, 0) || 0;
  if (!(quantityMt > 0)) return responseError(400, "El tonelaje real o contractual debe ser mayor que cero.");
  if (allowedHours === null && !(rateMtDay && rateMtDay > 0)) {
    return responseError(400, "Indica allowedHours o una tasa contractual rateMtDay válida.");
  }

  const statementAsOfAt = cleanTimestamp(body.statementAsOfAt) || new Date();
  const incidents = Array.isArray(body.incidents) ? body.incidents.slice(0, 100) : [];
  const calculation = calculateLaytime({
    quantityMt,
    rateMtDay: rateMtDay ?? undefined,
    allowedHours,
    laytimeRule: String(body.laytimeRule || "SHINC").toUpperCase() === "SHEX" ? "SHEX" : "SHINC",
    weatherPermitting: body.weatherPermitting !== false,
    onceOnDemurrage: body.onceOnDemurrage !== false,
    commencementDelayMinutes: Math.max(0, cleanNumber(body.commencementDelayMinutes, 0) || 0),
    portTimeZone: String(body.portTimeZone || "").trim() || null,
    demurrageRateUsdDay,
    norAcceptedAt: body.norAcceptedAt || null,
    laytimeCommencedAt: body.laytimeCommencedAt || null,
    operationCompletedAt: body.operationCompletedAt || null,
    asOfAt: statementAsOfAt.toISOString(),
    incidents,
  });
  const values = {
    contractRef,
    operation,
    quantityMt,
    rateMtDay,
    allowedHours,
    laytimeRule: calculation.terms.laytimeRule,
    weatherPermitting: calculation.terms.weatherPermitting,
    onceOnDemurrage: calculation.terms.onceOnDemurrage,
    commencementDelayMinutes: calculation.terms.commencementDelayMinutes,
    portTimeZone: String(body.portTimeZone || "").trim() || null,
    demurrageRateUsdDay,
    norTenderedAt: cleanTimestamp(body.norTenderedAt),
    norAcceptedAt: cleanTimestamp(body.norAcceptedAt),
    laytimeCommencedAt: cleanTimestamp(body.laytimeCommencedAt),
    operationStartedAt: cleanTimestamp(body.operationStartedAt),
    operationCompletedAt: cleanTimestamp(body.operationCompletedAt),
    statementAsOfAt,
    incidents,
    calculation,
    status: calculation.status,
    allowedSeconds: calculation.allowedSeconds || 0,
    usedSeconds: calculation.usedSeconds || 0,
    excludedSeconds: calculation.excludedSeconds || 0,
    balanceSeconds: calculation.balanceSeconds || 0,
    demurrageUsd: calculation.demurrageUsd || 0,
    updatedAt: new Date(),
  };

  const existing = await netlifyDb
    .select({ id: laytimeStatements.id })
    .from(laytimeStatements)
    .where(and(sql`upper(${laytimeStatements.contractRef}) = ${contractRef}`, eq(laytimeStatements.operation, operation)))
    .limit(1);
  const [saved] = existing[0]
    ? await netlifyDb.update(laytimeStatements).set(values).where(eq(laytimeStatements.id, existing[0].id)).returning()
    : await netlifyDb.insert(laytimeStatements).values(values).returning();

  return Response.json({ success: true, statement: serializeStatement(saved) }, { status: existing[0] ? 200 : 201 });
}

export default async (request: Request, context: Context) => {
  const contractRef = contractRefFromRequest(request, context);
  if (!CONTRACT_PATTERN.test(contractRef)) return responseError(400, "La referencia contractual no es válida.");

  try {
    await ensureTableExists();
    if (request.method === "GET") return await getStatements(contractRef, request);
    if (request.method === "PUT" || request.method === "POST") {
      const body = await request.json().catch(() => null) as StatementBody | null;
      if (!body) return responseError(400, "El body debe ser un JSON válido.");
      return await saveStatement(contractRef, body);
    }
    return responseError(405, "Método no permitido.");
  } catch (error: any) {
    console.error("[laytime-statement] Request failed.", { requestId: context.requestId, contractRef, message: error?.message });
    return responseError(500, `Error BD: ${error?.cause?.message || error?.message || "Desconocido"}`);
  }
};

export const config: Config = {
  path: "/api/v1/voyage/laytime/:ref",
};
