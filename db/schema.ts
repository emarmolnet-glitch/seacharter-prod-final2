import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const appConfig = pgTable("AppConfig", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

export const sessionSync = pgTable(
  "session_sync",
  {
    userId: text("user_id").primaryKey(),
    lastSyncData: jsonb("last_sync_data").notNull(),
    lastActionModule: text("last_action_module").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("session_sync_payload_object_check", sql`jsonb_typeof(${table.lastSyncData}) = 'object'`),
  ],
);

export const iaReports = pgTable("ia_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").default("PENDING").notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  reportData: jsonb("report_data"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dataBridgeVesselIngestions = pgTable("data_bridge_vessel_ingestions", {
  id: serial("id").primaryKey(),
  sourceFileName: text("source_file_name"),
  sourceFileType: text("source_file_type").notNull(),
  sourceProvider: text("source_provider"),
  auditStatus: text("audit_status").default("PENDIENTE_AUDITORIA").notNull(),
  vesselCount: integer("vessel_count").default(0).notNull(),
  payload: jsonb("payload").notNull(),
  rawText: text("raw_text"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
});

export const vesselsMaster = pgTable("vessels_master", {
  imoNumber: text("imo_number").primaryKey(),
  vesselName: text("vessel_name").notNull(),
  dwt: doublePrecision("dwt"),
  mmsi: text("mmsi"),
  vesselType: text("vessel_type"),
  draftMeters: doublePrecision("draft_meters"),
  flag: text("flag"),
  eta: text("eta"),
  lastPort: text("last_port"),
  currentDestination: text("current_destination"),
  yearBuilt: text("year_built"),
  ownerManager: text("owner_manager"),
  hasGears: boolean("has_gears").default(false).notNull(),
  processStatus: text("process_status"),
  source: text("source"),
  sourcePayload: jsonb("source_payload").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dataBridgeVesselSyncs = pgTable("databridge_vessel_syncs", {
  syncId: uuid("sync_id").primaryKey(),
  persistedImoNumbers: jsonb("persisted_imo_numbers").default(sql`'[]'::jsonb`).notNull(),
  rejectedCount: integer("rejected_count").default(0).notNull(),
  createdAt: createdAt(),
});
Haz "Commit" de este archivo.

2. Arregla la función de Netlify
Ahora abre el archivo netlify/functions/ais-scan-request.ts, borra todo lo que tiene, y pega este código final (fíjate que ya tiene las extensiones .js y el uso correcto de appConfig):

TypeScript
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
