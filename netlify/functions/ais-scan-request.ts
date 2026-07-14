import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";

const SCAN_STATUS_KEY = "scan_status";
const SCAN_STATUS_ON = "ON";

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const result = await getPool().query<{
      value: string;
      updated_at: Date;
    }>(
      `
        UPDATE "AppConfig"
        SET value = $1, updated_at = NOW()
        WHERE key = $2
        RETURNING value, updated_at
      `,
      [SCAN_STATUS_ON, SCAN_STATUS_KEY],
    );
    const updatedConfig = result.rows[0];

    if (!updatedConfig) {
      return Response.json(
        { success: false, error: "Scan configuration is not initialized" },
        { status: 409 },
      );
    }

    return Response.json({
      success: true,
      scanStatus: updatedConfig.value,
      requestedAt: updatedConfig.updated_at.toISOString(),
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
