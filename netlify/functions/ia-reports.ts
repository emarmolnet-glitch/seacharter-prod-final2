import type { Config } from "@netlify/functions";
import { fetchIaReports } from "../../db/ia-reports.js";

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const reports = await fetchIaReports();
    return Response.json({ success: true, ia_reports: reports });
  } catch (error) {
    console.error("[ia-reports] Data Bridge report fetch failed.", error);
    return Response.json({ success: false, error: "IA reports fetch failed" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/ia-reports",
};
