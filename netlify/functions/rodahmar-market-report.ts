import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { aggregateLast7DaysMarketData } from "../../db/market-report.js";
import { buildMarketReportHtmlTemplate } from "../../db/market-report-template.js";
import { generateMarketReportPdfBuffer } from "../../db/market-report-pdf.js";
import { createCorsHeaders } from "./_shared/cors.js";

const STORE_NAME = "rodahmar-market-reports";

export default async (req: Request) => {
  const corsHeaders = createCorsHeaders(req, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "pdf").toLowerCase();

    const reportData = await aggregateLast7DaysMarketData();
    const htmlContent = buildMarketReportHtmlTemplate(reportData);

    if (format === "html") {
      return new Response(htmlContent, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          ...corsHeaders,
        },
      });
    }

    const pdfBuffer = await generateMarketReportPdfBuffer(htmlContent);

    // Save to Blobs for history
    try {
      const store = getStore({ name: STORE_NAME, consistency: "strong" });
      const blobKey = `reports/${reportData.reportId}.pdf`;
      await store.set(blobKey, pdfBuffer);
      await store.setJSON(`reports/${reportData.reportId}-meta.json`, reportData);
    } catch (blobErr) {
      console.warn("[market-report] Could not save report blob:", blobErr);
    }

    const filename = `SeaCharter_Core_PRO_Market_Report_${reportData.periodEnd}.pdf`;

    if (format === "json") {
      return Response.json(
        {
          success: true,
          report: reportData,
          pdfBase64: pdfBuffer.toString("base64"),
          filename,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            ...corsHeaders,
          },
        }
      );
    }

    // Default: Direct PDF binary download
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("[market-report] Failed to generate market report:", error);
    return Response.json(
      {
        success: false,
        error: "Error al generar el SeaCharter Core PRO Market Report.",
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          ...corsHeaders,
        },
      }
    );
  }
};

export const config: Config = {
  path: "/api/rodahmar-market-report",
};
