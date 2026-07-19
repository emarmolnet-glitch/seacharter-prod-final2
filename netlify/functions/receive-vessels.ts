import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

type ValidationIssue = {
  index: number;
  vessel: string;
  field: string;
  message: string;
};

type PostgreSqlError = Error & {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
  cause?: unknown;
};

type VesselRow = {
  imoNumber: string;
  vesselName: string;
  dwt: number | null;
  mmsi: string | null;
  latitude: number | null;
  longitude: number | null;
  vesselType: string | null;
  draftMeters: number | null;
  flag: string | null;
  eta: string | null;
  lastPort: string | null;
  currentDestination: string | null;
  yearBuilt: string | null;
  ownerManager: string | null;
  hasGears: boolean;
  processStatus: string | null;
  source: string | null;
  sourcePayload: Record<string, unknown>;
};

type PersistenceIssue = {
  vessel: string;
  imoNumber: string;
  sqlState: string | null;
  message: string;
};

let vesselsMasterSchemaReady: Promise<void> | null = null;

const REQUIRED_VESSELS_MASTER_COLUMNS = [
  "imo_number",
  "vessel_name",
  "latitude",
  "longitude",
  "source_payload",
] as const;

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  const normalized = text.toUpperCase();
  return text && !["N/A", "NA", "UNK", "UNKNOWN", "NULL", "NONE", "-", "--"].includes(normalized) ? text : null;
}

function readFirst(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = typeof value === "string"
    ? value.trim().replace(/\s/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/[^\d.-]/g, "")
    : value;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function readValidImo(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const imoNumber = cleanImo(source[key]);
    if (imoNumber) return imoNumber;
  }
  return "";
}

function cleanBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "si", "sí", "geared"].includes(String(value ?? "").trim().toLowerCase());
}

function getVessels(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.vessels)) return source.vessels;
  if (Array.isArray(source.buques)) return source.buques;
  if (Array.isArray(source.selectedVessels)) return source.selectedVessels;
  return [];
}

function normalizeVessel(value: unknown, index: number) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const name = cleanText(readFirst(source, ["vessel_name", "vesselName", "nombre", "name", "ShipName", "ship"]));
  const imoKeys = ["imo_number", "IMO_NUMBER", "IMO", "imo", "numero_imo", "imoNumber", "numeroIMO"];
  const rawImo = readFirst(source, imoKeys);
  const imoNumber = readValidImo(source, imoKeys);
  const label = name || (rawImo ? `IMO ${String(rawImo)}` : `índice ${index}`);
  const rawDwt = readFirst(source, ["dwt", "DWT", "deadweight", "dwt_ajustado"]);
  const rawDraft = readFirst(source, ["draft_meters", "draft", "Draft", "calado"]);
  const rawLatitude = readFirst(source, ["latitude", "lat", "Latitude", "AIS_Live_Lat", "LAT"]);
  const rawLongitude = readFirst(source, ["longitude", "lon", "lng", "long", "Longitude", "AIS_Live_Lon", "LON", "LONG"]);
  const dwt = cleanNumber(rawDwt);
  const draftMeters = cleanNumber(rawDraft);
  const latitude = cleanNumber(rawLatitude);
  const longitude = cleanNumber(rawLongitude);
  const issues: ValidationIssue[] = [];

  if (!imoNumber) {
    issues.push({
      index,
      vessel: label,
      field: "imo_number",
      message: rawImo === null ? "El campo obligatorio imo_number está ausente." : "imo_number debe contener exactamente 7 dígitos.",
    });
  }
  if (!name) issues.push({ index, vessel: label, field: "vessel_name", message: "El campo obligatorio vessel_name está ausente." });
  if (rawDwt !== null && dwt === null) issues.push({ index, vessel: label, field: "dwt", message: "dwt no contiene un número válido." });
  if (rawDraft !== null && draftMeters === null) issues.push({ index, vessel: label, field: "draft_meters", message: "draft_meters no contiene un número válido." });
  if (rawLatitude !== null && (latitude === null || latitude < -90 || latitude > 90)) {
    issues.push({ index, vessel: label, field: "latitude", message: "latitude debe ser un número entre -90 y 90." });
  }
  if (rawLongitude !== null && (longitude === null || longitude < -180 || longitude > 180)) {
    issues.push({ index, vessel: label, field: "longitude", message: "longitude debe ser un número entre -180 y 180." });
  }
  if ((rawLatitude === null) !== (rawLongitude === null)) {
    issues.push({ index, vessel: label, field: "coordinates", message: "latitude y longitude deben enviarse juntas." });
  }

  const vessel: VesselRow | null = issues.length === 0 && name ? {
    imoNumber,
    vesselName: name,
    dwt,
    mmsi: cleanText(readFirst(source, ["mmsi", "MMSI"])),
    latitude,
    longitude,
    vesselType: cleanText(readFirst(source, ["vessel_type", "type", "tipo", "tipo_buque"])),
    draftMeters,
    flag: cleanText(readFirst(source, ["flag", "Flag", "bandera"])),
    eta: cleanText(readFirst(source, ["eta", "ETA", "eta_puerto_carga", "estimatedEta", "etaEstimated"])),
    lastPort: cleanText(readFirst(source, ["last_port", "lastPort", "ultimo_puerto", "lastPortOfCall"])),
    currentDestination: cleanText(readFirst(source, ["current_destination", "destino_actual", "destination", "plannedDestination"])),
    yearBuilt: cleanText(readFirst(source, ["year_built", "yearBuilt", "ano_construccion", "anio_construccion", "builtYear"])),
    ownerManager: cleanText(readFirst(source, ["owner_manager", "armador_manager", "owner", "manager", "operator"])),
    hasGears: cleanBoolean(readFirst(source, ["has_gears", "gruas_geared", "hasCranes", "gruas"])),
    processStatus: cleanText(readFirst(source, ["process_status", "estadoProcesos", "status", "audit_status", "auditStatus"])),
    source: cleanText(readFirst(source, ["source", "origen_datos", "provider"])),
    sourcePayload: source,
  } : null;

  return { vessel, issues };
}

async function ensureVesselsMasterSchema() {
  vesselsMasterSchemaReady ??= getPool().query(`
    CREATE TABLE IF NOT EXISTS vessels_master (
      imo_number TEXT PRIMARY KEY,
      vessel_name TEXT NOT NULL,
      dwt DOUBLE PRECISION,
      mmsi TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      vessel_type TEXT,
      draft_meters DOUBLE PRECISION,
      flag TEXT,
      eta TEXT,
      last_port TEXT,
      current_destination TEXT,
      year_built TEXT,
      owner_manager TEXT,
      has_gears BOOLEAN NOT NULL DEFAULT FALSE,
      process_status TEXT,
      source TEXT,
      source_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE vessels_master ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE vessels_master ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

    CREATE TABLE IF NOT EXISTS databridge_vessel_syncs (
      sync_id UUID PRIMARY KEY,
      persisted_imo_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).then(async () => {
    const schemaResult = await getPool().query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'vessels_master'
          AND column_name = ANY($1::text[])
      `,
      [REQUIRED_VESSELS_MASTER_COLUMNS],
    );
    const availableColumns = new Set(schemaResult.rows.map((row) => row.column_name));
    const missingColumns = REQUIRED_VESSELS_MASTER_COLUMNS.filter((column) => !availableColumns.has(column));
    if (missingColumns.length > 0) {
      throw new Error(`vessels_master schema is missing required columns: ${missingColumns.join(", ")}`);
    }
  }).catch((error: unknown) => {
    vesselsMasterSchemaReady = null;
    throw error;
  });
  return vesselsMasterSchemaReady;
}

function findPostgreSqlError(error: unknown): PostgreSqlError | null {
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as PostgreSqlError;
    if (typeof candidate.code === "string") return candidate;
    current = candidate.cause;
  }
  return null;
}

function validateVesselsBeforePersistence(vessels: VesselRow[]) {
  return vessels.flatMap((vessel, index) => {
    const issues: ValidationIssue[] = [];
    if (!vessel.imoNumber) {
      issues.push({ index, vessel: vessel.vesselName || `índice ${index}`, field: "imo_number", message: "imo_number es obligatorio antes de persistir." });
    }
    if (!vessel.vesselName) {
      issues.push({ index, vessel: vessel.imoNumber || `índice ${index}`, field: "vessel_name", message: "vessel_name es obligatorio antes de persistir." });
    }
    if (!vessel.sourcePayload || typeof vessel.sourcePayload !== "object" || Array.isArray(vessel.sourcePayload)) {
      issues.push({ index, vessel: vessel.vesselName || vessel.imoNumber, field: "source_payload", message: "source_payload debe ser un objeto JSON." });
    }
    if ((vessel.latitude === null) !== (vessel.longitude === null)) {
      issues.push({ index, vessel: vessel.vesselName || vessel.imoNumber, field: "coordinates", message: "latitude y longitude deben persistirse juntas." });
    }
    if (vessel.latitude !== null && (vessel.latitude < -90 || vessel.latitude > 90)) {
      issues.push({ index, vessel: vessel.vesselName || vessel.imoNumber, field: "latitude", message: "latitude está fuera de rango." });
    }
    if (vessel.longitude !== null && (vessel.longitude < -180 || vessel.longitude > 180)) {
      issues.push({ index, vessel: vessel.vesselName || vessel.imoNumber, field: "longitude", message: "longitude está fuera de rango." });
    }
    return issues;
  });
}

async function upsertVesselBatch(vessels: VesselRow[]) {
  await ensureVesselsMasterSchema();
  const client = await getPool().connect();
  const persistenceErrors: PersistenceIssue[] = [];
  let processedCount = 0;
  try {
    for (const vessel of vessels) {
      try {
        await client.query(
          `
            INSERT INTO vessels_master (
              imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type, draft_meters, flag, eta,
              last_port, current_destination, year_built, owner_manager, has_gears,
              process_status, source, source_payload, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, NOW())
            ON CONFLICT (imo_number) DO UPDATE SET
              vessel_name = EXCLUDED.vessel_name,
              dwt = EXCLUDED.dwt,
              mmsi = EXCLUDED.mmsi,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              vessel_type = EXCLUDED.vessel_type,
              draft_meters = EXCLUDED.draft_meters,
              flag = EXCLUDED.flag,
              eta = EXCLUDED.eta,
              last_port = EXCLUDED.last_port,
              current_destination = EXCLUDED.current_destination,
              year_built = EXCLUDED.year_built,
              owner_manager = EXCLUDED.owner_manager,
              has_gears = EXCLUDED.has_gears,
              process_status = EXCLUDED.process_status,
              source = EXCLUDED.source,
              source_payload = EXCLUDED.source_payload,
              updated_at = NOW()
          `,
          [
            vessel.imoNumber, vessel.vesselName, vessel.dwt, vessel.mmsi, vessel.latitude, vessel.longitude,
            vessel.vesselType, vessel.draftMeters, vessel.flag, vessel.eta,
            vessel.lastPort, vessel.currentDestination, vessel.yearBuilt, vessel.ownerManager, vessel.hasGears, vessel.processStatus, vessel.source,
            JSON.stringify(vessel.sourcePayload),
          ],
        );
        processedCount += 1;
      } catch (error) {
        const postgresError = findPostgreSqlError(error);
        const issue = {
          vessel: vessel.vesselName,
          imoNumber: vessel.imoNumber,
          sqlState: postgresError?.code || null,
          message: error instanceof Error ? error.message : "Error desconocido",
        };
        persistenceErrors.push(issue);
        console.error("[databridge-post] Error PostgreSQL en buque individual", {
          ...issue,
          constraint: postgresError?.constraint || null,
          table: postgresError?.table || "vessels_master",
          column: postgresError?.column || null,
          detail: postgresError?.detail || null,
        });
      }
    }
  } finally {
    client.release();
  }
  return { processedCount, persistenceErrors };
}

async function saveVesselSync(syncId: string, persistedImoNumbers: string[], rejectedCount: number) {
  await ensureVesselsMasterSchema();
  await getPool().query(
    `
      INSERT INTO databridge_vessel_syncs (sync_id, persisted_imo_numbers, rejected_count)
      VALUES ($1::uuid, $2::jsonb, $3)
      ON CONFLICT (sync_id) DO UPDATE SET
        persisted_imo_numbers = EXCLUDED.persisted_imo_numbers,
        rejected_count = EXCLUDED.rejected_count
    `,
    [syncId, JSON.stringify(persistedImoNumbers), rejectedCount],
  );
}

export async function handleVesselBatch(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders });
  if (req.method !== "POST") return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: jsonHeaders });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ success: false, error: "Payload JSON inválido." }, { status: 400, headers: jsonHeaders });
  }

  const inputVessels = getVessels(payload);
  if (inputVessels.length === 0) return Response.json({ success: false, error: "El lote no contiene buques." }, { status: 400, headers: jsonHeaders });

  const normalized = inputVessels.map(normalizeVessel);
  const validationErrors = normalized.flatMap((result) => result.issues);
  if (validationErrors.length > 0) {
    console.warn("[databridge-post] Buques descartados por validación", {
      vesselCount: inputVessels.length,
      rejectedCount: validationErrors.length,
      validationErrors,
    });
  }

  const vesselsByImo = new Map<string, VesselRow>();
  normalized.forEach(({ vessel }) => { if (vessel) vesselsByImo.set(vessel.imoNumber, vessel); });
  const vessels = Array.from(vesselsByImo.values());
  const persistencePreflightErrors = validateVesselsBeforePersistence(vessels);
  if (persistencePreflightErrors.length > 0) {
    return Response.json({
      success: false,
      error: "El lote contiene campos obligatorios inválidos y no se intentó persistir.",
      validationErrors: persistencePreflightErrors,
    }, { status: 422, headers: jsonHeaders });
  }
  const rejectedVesselIndexes = new Set(validationErrors.map((issue) => issue.index));
  const rejectedCount = rejectedVesselIndexes.size;
  const syncId = crypto.randomUUID();

  if (vessels.length === 0) {
    await saveVesselSync(syncId, [], rejectedCount);
    return Response.json({
      success: true,
      partial: rejectedCount > 0,
      message: `Se procesaron 0 buques correctamente, ${rejectedCount} buques fueron rechazados por formato inválido.`,
      receivedCount: inputVessels.length,
      processedCount: 0,
      acceptedCount: 0,
      rejectedCount,
      validationErrors,
      syncId,
      persistedImoNumbers: [],
    }, { headers: jsonHeaders });
  }

  try {
    const persistenceResult = await upsertVesselBatch(vessels);
    const totalRejectedCount = rejectedCount + persistenceResult.persistenceErrors.length;
    const failedImoNumbers = new Set(persistenceResult.persistenceErrors.map((issue) => issue.imoNumber));
    const persistedImoNumbers = vessels.map((vessel) => vessel.imoNumber).filter((imoNumber) => !failedImoNumbers.has(imoNumber));
    await saveVesselSync(syncId, persistedImoNumbers, totalRejectedCount);
    console.log("[databridge-post] Lote persistido en vessels_master", {
      receivedCount: inputVessels.length,
      persistedCount: persistenceResult.processedCount,
      rejectedCount: totalRejectedCount,
    });
    return Response.json({
      success: true,
      partial: totalRejectedCount > 0,
      message: `Se procesaron ${persistenceResult.processedCount} buques correctamente, ${totalRejectedCount} buques fueron rechazados.`,
      receivedCount: inputVessels.length,
      processedCount: persistenceResult.processedCount,
      acceptedCount: persistenceResult.processedCount,
      persistedCount: persistenceResult.processedCount,
      rejectedCount: totalRejectedCount,
      formatRejectedCount: rejectedCount,
      persistenceRejectedCount: persistenceResult.persistenceErrors.length,
      validationErrors,
      persistenceErrors: persistenceResult.persistenceErrors,
      duplicateImosInBatch: normalized.filter((result) => result.vessel).length - vessels.length,
      syncId,
      persistedImoNumbers,
    }, { headers: jsonHeaders });
  } catch (error) {
    const postgresError = findPostgreSqlError(error);
    console.error("[databridge-post] Error PostgreSQL al persistir vessels_master", {
      sqlState: postgresError?.code || "UNKNOWN",
      constraint: postgresError?.constraint || null,
      table: postgresError?.table || "vessels_master",
      column: postgresError?.column || null,
      detail: postgresError?.detail || null,
      message: error instanceof Error ? error.message : "Error desconocido",
      batchSize: vessels.length,
      imoNumbers: vessels.map((vessel) => vessel.imoNumber),
    });
    return Response.json({
      success: false,
      error: "No se pudo persistir el lote en vessels_master.",
      sqlState: postgresError?.code || null,
    }, { status: 500, headers: jsonHeaders });
  }
}

export default handleVesselBatch;

export const config: Config = {
  path: ["/api/receive-vessels", "/.netlify/functions/receive-vessels"],
};
