import { desc, eq } from "drizzle-orm";
import { db } from "./index.js";
import { iaReports } from "./schema.js";

export type IaReportStatus = "PENDING" | "COMPLETED" | "ERROR";

export async function createIaReport(requestPayload: unknown) {
  const [report] = await db.insert(iaReports).values({ requestPayload }).returning();
  return report;
}

export async function getIaReport(reportId: string) {
  const [report] = await db.select().from(iaReports).where(eq(iaReports.id, reportId)).limit(1);
  return report;
}

export async function fetchIaReports() {
  return db.select().from(iaReports).orderBy(desc(iaReports.updatedAt));
}

export async function completeIaReport(reportId: string, reportData: unknown) {
  await db.update(iaReports).set({
    status: "COMPLETED",
    reportData,
    errorMessage: null,
    updatedAt: new Date(),
  }).where(eq(iaReports.id, reportId));
}

export async function failIaReport(reportId: string, errorMessage: string) {
  await db.update(iaReports).set({
    status: "ERROR",
    reportData: null,
    errorMessage,
    updatedAt: new Date(),
  }).where(eq(iaReports.id, reportId));
}
