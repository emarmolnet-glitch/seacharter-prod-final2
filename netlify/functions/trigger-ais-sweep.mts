import type { Config, Context } from "@netlify/functions";
import { getPool } from "../../db/index.js";
import handleScanRequest from "./ais-scan-request.js";

const RADAR_BUFFER_TABLE = "vessel_radar_feed";
type DeferredContext = Context & { waitUntil?: (promise: Promise<unknown>) => void };
const runScanRequest = handleScanRequest as unknown as (request: Request) => Promise<Response>;

async function isRadarBufferAvailable() {
  const result = await getPool().query<{ available: boolean }>(`
    SELECT COALESCE(
      to_regclass('public.vessel_radar_feed') IS NOT NULL
      AND has_table_privilege(current_user, to_regclass('public.vessel_radar_feed'), 'SELECT')
      AND has_table_privilege(current_user, to_regclass('public.vessel_radar_feed'), 'INSERT'),
      FALSE
    ) AS available
  `);
  return result.rows[0]?.available === true;
}

async function executeSweep(request: Request, requestId: string) {
  try {
    const response = await runScanRequest(request);
    if (!response.ok) {
      console.error("[trigger-ais-sweep] Background sweep failed.", {
        requestId,
        status: response.status,
      });
    }
  } catch (error) {
    console.error("[trigger-ais-sweep] Background sweep crashed.", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown sweep error",
    });
  }
}

export default async (req: Request, context: DeferredContext) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, accepted: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!await isRadarBufferAvailable()) {
      return Response.json({
        success: false,
        accepted: false,
        code: "AIS_RADAR_BUFFER_UNAVAILABLE",
        error: `AIS sweep buffer ${RADAR_BUFFER_TABLE} is unavailable or not writable`,
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  } catch (error) {
    console.error("[trigger-ais-sweep] Unable to verify radar buffer availability.", {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : "Unknown database error",
    });
    return Response.json({
      success: false,
      accepted: false,
      code: "AIS_RADAR_BUFFER_CHECK_FAILED",
      error: "Unable to verify the AIS sweep buffer",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  if (typeof context.waitUntil !== "function") {
    return Response.json({
      success: false,
      accepted: false,
      code: "AIS_ASYNC_EXECUTION_UNAVAILABLE",
      error: "Asynchronous AIS sweep execution is unavailable",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const requestedAt = new Date().toISOString();
  context.waitUntil(executeSweep(req.clone(), context.requestId));

  return Response.json({
    success: true,
    accepted: true,
    scanStatus: "QUEUED",
    requestId: context.requestId,
    requestedAt,
    buffer: RADAR_BUFFER_TABLE,
  }, { status: 202, headers: { "cache-control": "no-store" } });
};

export const config: Config = {
  path: "/api/trigger-ais-sweep",
  method: "POST",
};
