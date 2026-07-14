import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appState } from "../../db/schema.js";

const SCAN_STATUS_KEY = "scan_status";
const SCAN_STATUS_ON = "ON";

export default async (req: Request) => {
  // 1. Verificación de seguridad
  const authHeader = req.headers.get("Authorization");
  const expectedSecret = `Bearer ${process.env.DATA_BRIDGE_API_SECRET}`;

  if (authHeader !== expectedSecret) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const [updatedConfig] = await db
      .update(appState)
      .set({ value: SCAN_STATUS_ON, updatedAt: new Date() })
      .where(eq(appState.key, SCAN_STATUS_KEY))
      .returning({ value: appState.value, updatedAt: appState.updatedAt });

    if (!updatedConfig) {
      return Response.json({ success: false, error: "Scan configuration not initialized" }, { status: 409 });
    }

    return Response.json({ success: true, scanStatus: updatedConfig.value });
  } catch (error) {
    console.error("[ais-scan-request] Error:", error);
    return Response.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
};

export const config: Config = { path: "/api/ais/scan-request" };
