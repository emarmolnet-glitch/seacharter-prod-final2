import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";

const SCAN_STATUS_KEY = "scan_status";
const SCAN_STATUS_ON = "ON";

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const requestedAt = new Date();
    const [updatedConfig] = await db
      .insert(appConfig)
      .values({ key: SCAN_STATUS_KEY, value: SCAN_STATUS_ON, updatedAt: requestedAt })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value: SCAN_STATUS_ON, updatedAt: requestedAt },
      })
      .returning({ value: appConfig.value, updatedAt: appConfig.updatedAt });

    return Response.json({
      success: true,
      scanStatus: updatedConfig.value,
      requestedAt: updatedConfig.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[ais-scan-request] Failed to activate Data Bridge scan.", error);
    return Response.json(
      { success: false, error: "Unable to send the scan request" },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/ais/scan-request",
  method: "POST",
};
