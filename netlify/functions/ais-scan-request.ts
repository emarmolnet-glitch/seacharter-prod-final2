import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";

const SCAN_STATUS_KEY = "scan_status";
const SCAN_STATUS_ON = "ON";

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const [updatedConfig] = await db
      .update(appConfig)
      .set({ value: SCAN_STATUS_ON, updatedAt: new Date() })
      .where(eq(appConfig.key, SCAN_STATUS_KEY))
      .returning({ value: appConfig.value, updatedAt: appConfig.updatedAt });

    if (!updatedConfig) {
      return Response.json(
        { success: false, error: "Scan configuration is not initialized" },
        { status: 409 },
      );
    }

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
};
