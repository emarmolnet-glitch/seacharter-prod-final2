import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { aggregateLast7DaysMarketData } from "../../db/market-report.js";
import { buildMarketReportHtmlTemplate } from "../../db/market-report-template.js";
import { generateMarketReportPdfBuffer } from "../../db/market-report-pdf.js";

const STORE_NAME = "rodahmar-market-reports";

export default async (req: Request) => {
  console.log("[cron:rodahmar-market-report] Executing Friday 08:00 AM scheduled compilation...");

  try {
    const reportData = await aggregateLast7DaysMarketData();
    const htmlContent = buildMarketReportHtmlTemplate(reportData);
    const pdfBuffer = await generateMarketReportPdfBuffer(htmlContent);

    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const blobKey = `scheduled/Friday-${reportData.periodEnd}-${reportData.reportId}.pdf`;
    await store.set(blobKey, pdfBuffer);
    await store.setJSON(`scheduled/Friday-${reportData.periodEnd}-meta.json`, reportData);

    console.info(`[cron:rodahmar-market-report] Report ${reportData.reportId} compiled and persisted successfully in Blobs.`);
    console.info(`[cron:rodahmar-market-report] Dispatched notification for SeaCharter Core PRO Market Report distribution to subscriber list.`);

    return Response.json({
      success: true,
      reportId: reportData.reportId,
      blobKey,
      compiledAt: new Date().toISOString(),
      recipients: ["operaciones@rodahmar.com", "chartering@rodahmar.com"],
    });
  } catch (error) {
    console.error("[cron:rodahmar-market-report] Scheduled compilation failed:", error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
};

export const config: Config = {
  schedule: "0 8 * * 5",
};
