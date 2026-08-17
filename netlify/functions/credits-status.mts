import type { Config } from "@netlify/functions";
import { AisCoordinatorError, getDatalasticCreditSnapshot } from "./_shared/aisCoordinator.js";

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await getDatalasticCreditSnapshot();
    return Response.json({ success: true, data }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const controlled = error instanceof AisCoordinatorError;
    if (!controlled) console.error("[credits-status] Credit status request failed.");
    return Response.json({
      success: false,
      error: controlled ? error.message : "Credit status unavailable",
      code: controlled ? error.code : "CREDIT_STATUS_ERROR",
    }, {
      status: controlled ? error.status : 500,
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/credits/status",
  method: "GET",
};
