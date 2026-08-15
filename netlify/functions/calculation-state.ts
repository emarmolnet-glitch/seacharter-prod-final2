import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db, ensureApplicationSchema } from "../../db/index.js";
import { appConfig } from "../../db/schema.js";
import { createCorsHeaders } from "./_shared/cors.js";

const CALCULATION_STATE_CONFIG_KEY = "latest_calculation_state";
const MAX_CALCULATION_PAYLOAD_BYTES = 256_000;
const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCalculationContractFields(value: Record<string, unknown>) {
  const route = isRecord(value.route) ? value.route : {};
  const cargo = isRecord(value.cargo) ? value.cargo : {};
  const laycan = isRecord(value.laycan) ? value.laycan : {};
  const firstText = (...values: unknown[]) => {
    const match = values.map((item) => String(item ?? "").trim()).find(Boolean);
    return match || "";
  };
  const firstPositiveNumber = (...values: unknown[]) => {
    const match = values.map(Number).find((item) => Number.isFinite(item) && item > 0);
    return match || 0;
  };
  const laydays = firstText(laycan.laydays, laycan.start, route.laydays, route.laycan_start, route.laycan, value.laydays, value.laycanDate, value.laycan_start);
  const cancelling = firstText(laycan.cancelling, laycan.end, route.cancelling, route.laycan_end, value.cancelling, value.cancellingDate, value.laycan_end);
  const cargoQuantity = firstPositiveNumber(cargo.cargoQuantity, cargo.quantity, value.cargoQuantity, value.cargoQty, value.cargo);
  const cargoType = firstText(cargo.typeLabel, cargo.cargoDescription, value.cargoType, value.cargoProduct, value.cargoTypeManual);
  const loadRate = firstPositiveNumber(cargo.loadRate, value.loadRate);
  const dischargeRate = firstPositiveNumber(cargo.dischargeRate, value.dischargeRate, value.dischRate);
  return {
    ...value,
    route: { ...route, laydays, cancelling, laycan: laydays, laycan_start: laydays, laycan_end: cancelling },
    laycan: { laydays, cancelling },
    laydays,
    cancelling,
    laycanDate: laydays,
    cancellingDate: cancelling,
    laycan_start: laydays,
    laycan_end: cancelling,
    cargo: {
      ...cargo,
      quantity: cargoQuantity,
      cargoQuantity,
      typeLabel: cargoType,
      cargoDescription: cargoType,
      loadRate,
      dischargeRate,
    },
    cargoQuantity,
    cargoType,
    loadRate,
    dischargeRate,
  };
}

export default async (req: Request) => {
  const headers = {
    ...baseHeaders,
    ...createCorsHeaders(req, "GET, POST, OPTIONS"),
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method === "GET") {
    try {
      await ensureApplicationSchema();
      const [row] = await db
        .select({ value: appConfig.value, updatedAt: appConfig.updatedAt })
        .from(appConfig)
        .where(eq(appConfig.key, CALCULATION_STATE_CONFIG_KEY))
        .limit(1);
      const parsedCalculation = row?.value ? JSON.parse(row.value) : null;
      const calculation = isRecord(parsedCalculation) ? normalizeCalculationContractFields(parsedCalculation) : null;
      return Response.json({
        success: true,
        calculation,
        persistedAt: row?.updatedAt?.toISOString?.() || null,
      }, { headers });
    } catch (error) {
      console.error("[calculation-state] Failed to read calculation.", error);
      return Response.json({ success: false, error: "Calculation state is unavailable" }, { status: 500, headers });
    }
  }
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!isRecord(body) || !isRecord(body.calculation)) {
      return Response.json({ success: false, error: "calculation must be an object" }, { status: 400, headers });
    }

    const persistedAt = new Date().toISOString();
    const persistedCalculation = normalizeCalculationContractFields({
      ...body.calculation,
      persistedAt,
    });
    const value = JSON.stringify(persistedCalculation);
    if (Buffer.byteLength(value, "utf8") > MAX_CALCULATION_PAYLOAD_BYTES) {
      return Response.json({ success: false, error: "Calculation payload is too large" }, { status: 413, headers });
    }

    await ensureApplicationSchema();
    await db
      .insert(appConfig)
      .values({ key: CALCULATION_STATE_CONFIG_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value, updatedAt: new Date() },
      });

    return Response.json({ success: true, persistedAt }, { headers });
  } catch (error) {
    console.error("[calculation-state] Failed to persist calculation.", error);
    return Response.json({ success: false, error: "Calculation persistence failed" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/calculation-state",
};
