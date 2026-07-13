import { ensureApplicationSchema, getPool } from "./index.js";

export type IaReportStatus = "PENDING" | "COMPLETED" | "ERROR";

export type IaReportRow = {
  id: string;
  status: IaReportStatus;
  requestPayload: unknown;
  reportData: unknown | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VesselSyncContext = {
  syncId: string;
  persistedImoNumbers: string[];
  existingImoNumbers: string[];
};

type IaReportDatabaseRow = {
  id: string;
  status: IaReportStatus;
  request_payload: unknown;
  report_data: unknown | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapIaReportRow(row: IaReportDatabaseRow): IaReportRow {
  return {
    id: row.id,
    status: row.status,
    requestPayload: row.request_payload,
    reportData: row.report_data,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createIaReport(requestPayload: unknown) {
  await ensureApplicationSchema();
  const result = await getPool().query<IaReportDatabaseRow>(
    `
      INSERT INTO ia_reports (request_payload)
      VALUES ($1::jsonb)
      RETURNING id, status, request_payload, report_data, error_message, created_at, updated_at
    `,
    [JSON.stringify(requestPayload)],
  );

  return mapIaReportRow(result.rows[0]);
}

export async function getIaReport(reportId: string) {
  await ensureApplicationSchema();
  const result = await getPool().query<IaReportDatabaseRow>(
    `
      SELECT id, status, request_payload, report_data, error_message, created_at, updated_at
      FROM ia_reports
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [reportId],
  );

  return result.rows[0] ? mapIaReportRow(result.rows[0]) : undefined;
}

export async function fetchIaReports(syncId = "") {
  await ensureApplicationSchema();
  const result = syncId
    ? await getPool().query<IaReportDatabaseRow>(
        `
          SELECT id, status, request_payload, report_data, error_message, created_at, updated_at
          FROM ia_reports
          WHERE request_payload ->> 'dataBridgeSyncId' = $1
          ORDER BY updated_at DESC
        `,
        [syncId],
      )
    : await getPool().query<IaReportDatabaseRow>(`
        SELECT id, status, request_payload, report_data, error_message, created_at, updated_at
        FROM ia_reports
        ORDER BY updated_at DESC
      `);

  return result.rows.map(mapIaReportRow);
}

export async function getVesselSyncContext(syncId: string): Promise<VesselSyncContext | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncId)) {
    return undefined;
  }
  await ensureApplicationSchema();
  let syncResult;
  try {
    syncResult = await getPool().query<{ sync_id: string; persisted_imo_numbers: unknown }>(
      `
        SELECT sync_id, persisted_imo_numbers
        FROM databridge_vessel_syncs
        WHERE sync_id = $1::uuid
        LIMIT 1
      `,
      [syncId],
    );
  } catch (error) {
    const postgresError = error as { code?: string };
    if (postgresError.code === "42P01") return undefined;
    throw error;
  }
  const syncRow = syncResult.rows[0];
  if (!syncRow) return undefined;

  const persistedImoNumbers = Array.isArray(syncRow.persisted_imo_numbers)
    ? syncRow.persisted_imo_numbers.map((value) => String(value)).filter(Boolean)
    : [];
  if (persistedImoNumbers.length === 0) {
    return { syncId: syncRow.sync_id, persistedImoNumbers, existingImoNumbers: [] };
  }

  const vesselResult = await getPool().query<{ imo_number: string }>(
    `
      SELECT imo_number
      FROM vessels_master
      WHERE imo_number = ANY($1::text[])
    `,
    [persistedImoNumbers],
  );

  return {
    syncId: syncRow.sync_id,
    persistedImoNumbers,
    existingImoNumbers: vesselResult.rows.map((row) => row.imo_number),
  };
}

export async function completeIaReport(reportId: string, reportData: unknown) {
  await ensureApplicationSchema();
  await getPool().query(
    `
      UPDATE ia_reports
      SET
        status = 'COMPLETED',
        report_data = $1::jsonb,
        error_message = NULL,
        updated_at = NOW()
      WHERE id = $2::uuid
    `,
    [JSON.stringify(reportData), reportId],
  );
}

export async function failIaReport(reportId: string, errorMessage: string) {
  await ensureApplicationSchema();
  await getPool().query(
    `
      UPDATE ia_reports
      SET
        status = 'ERROR',
        report_data = NULL,
        error_message = $1,
        updated_at = NOW()
      WHERE id = $2::uuid
    `,
    [errorMessage, reportId],
  );
}
