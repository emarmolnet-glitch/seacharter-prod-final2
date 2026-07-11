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

export async function fetchIaReports() {
  await ensureApplicationSchema();
  const result = await getPool().query<IaReportDatabaseRow>(`
    SELECT id, status, request_payload, report_data, error_message, created_at, updated_at
    FROM ia_reports
    ORDER BY updated_at DESC
  `);

  return result.rows.map(mapIaReportRow);
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
