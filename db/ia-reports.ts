import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "./index.js";
import { dataBridgeVesselSyncs, iaReports, vesselsMaster } from "./schema.js";

export type IaReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "ERROR";

export type IaReportRow = {
  id: string;
  status: IaReportStatus;
  progress: number;
  attemptCount: number;
  requestPayload: unknown;
  reportData: unknown | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VesselSyncContext = {
  syncId: string;
  persistedImoNumbers: string[];
  existingImoNumbers: string[];
};

function mapIaReportRow(row: typeof iaReports.$inferSelect): IaReportRow {
  return {
    ...row,
    status: row.status as IaReportStatus,
  };
}

export async function createIaReport(requestPayload: unknown) {
  const [row] = await db.insert(iaReports).values({ requestPayload }).returning();
  return mapIaReportRow(row);
}

export async function getIaReport(reportId: string) {
  const [row] = await db.select().from(iaReports).where(eq(iaReports.id, reportId)).limit(1);
  return row ? mapIaReportRow(row) : undefined;
}

export async function fetchIaReports(syncId = "") {
  const query = db.select().from(iaReports);
  const rows = syncId
    ? await query.where(sql`${iaReports.requestPayload} ->> 'dataBridgeSyncId' = ${syncId}`).orderBy(desc(iaReports.updatedAt))
    : await query.orderBy(desc(iaReports.updatedAt));
  return rows.map(mapIaReportRow);
}

export async function claimIaReport(reportId: string) {
  const [row] = await db
    .update(iaReports)
    .set({
      status: "PROCESSING",
      progress: 10,
      attemptCount: sql`${iaReports.attemptCount} + 1`,
      startedAt: new Date(),
      completedAt: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(and(eq(iaReports.id, reportId), eq(iaReports.status, "PENDING")))
    .returning();
  return row ? mapIaReportRow(row) : undefined;
}

export async function updateIaReportProgress(reportId: string, progress: number) {
  await db
    .update(iaReports)
    .set({ progress: Math.max(0, Math.min(99, Math.round(progress))), updatedAt: new Date() })
    .where(and(eq(iaReports.id, reportId), eq(iaReports.status, "PROCESSING")));
}

export async function expireStaleIaReport(reportId: string, staleBefore: Date) {
  const [row] = await db
    .update(iaReports)
    .set({
      status: "ERROR",
      reportData: null,
      errorMessage: "La función de procesamiento superó el tiempo máximo permitido. Inicia una nueva auditoría.",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(iaReports.id, reportId),
      inArray(iaReports.status, ["PENDING", "PROCESSING"]),
      lt(iaReports.updatedAt, staleBefore),
    ))
    .returning();
  return row ? mapIaReportRow(row) : undefined;
}

export async function getVesselSyncContext(syncId: string): Promise<VesselSyncContext | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncId)) {
    return undefined;
  }

  const [syncRow] = await db
    .select()
    .from(dataBridgeVesselSyncs)
    .where(eq(dataBridgeVesselSyncs.syncId, syncId))
    .limit(1);
  if (!syncRow) return undefined;

  const persistedImoNumbers = Array.isArray(syncRow.persistedImoNumbers)
    ? syncRow.persistedImoNumbers.map((value) => String(value)).filter(Boolean)
    : [];
  if (persistedImoNumbers.length === 0) {
    return { syncId: syncRow.syncId, persistedImoNumbers, existingImoNumbers: [] };
  }

  const vesselRows = await db
    .select({ imoNumber: vesselsMaster.imoNumber })
    .from(vesselsMaster)
    .where(inArray(vesselsMaster.imoNumber, persistedImoNumbers));

  return {
    syncId: syncRow.syncId,
    persistedImoNumbers,
    existingImoNumbers: vesselRows.map((row) => row.imoNumber),
  };
}

export async function completeIaReport(reportId: string, reportData: unknown) {
  await db
    .update(iaReports)
    .set({
      status: "COMPLETED",
      progress: 100,
      reportData,
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(iaReports.id, reportId));
}

export async function failIaReport(reportId: string, errorMessage: string) {
  await db
    .update(iaReports)
    .set({
      status: "ERROR",
      reportData: null,
      errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(iaReports.id, reportId));
}
