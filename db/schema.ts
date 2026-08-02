import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
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

export const pdaVesselConfirmations = pgTable("pda_vessel_confirmations", {
  id: uuid("id").defaultRandom().primaryKey(),
  estimationId: text("estimation_id"),
  vesselName: text("vessel_name").notNull(),
  imoNumber: text("imo_number"),
  pol: text("pol"),
  pod: text("pod"),
  previousVessel: jsonb("previous_vessel").notNull(),
  actualVessel: jsonb("actual_vessel").notNull(),
  operationalValidation: jsonb("operational_validation").notNull(),
  financialBreakdown: jsonb("financial_breakdown").notNull(),
  createdAt: createdAt(),
});

export const sessionSync = pgTable(
  "session_sync",
  {
    userId: text("user_id").primaryKey(),
    syncId: text("sync_id").notNull(),
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
  progress: integer("progress").default(0).notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  requestPayload: jsonb("request_payload").notNull(),
  reportData: jsonb("report_data"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
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

export const vesselsMaster = pgTable(
  "vessels_master",
  {
    id: serial("id").primaryKey(),
    imoNumber: integer("imo_number").unique(),
    vesselName: text("vessel_name"),
    dwt: integer("dwt"),
    mmsi: text("mmsi"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    vesselType: text("vessel_type"),
    draftMeters: doublePrecision("draft_meters"),
    flag: text("flag"),
    callSign: text("call_sign"),
    eta: timestamp("eta", { withTimezone: true, mode: "string" }),
    lastPort: text("last_port"),
    currentDestination: text("current_destination"),
    yearBuilt: integer("year_built"),
    grossTonnage: numeric("gross_tonnage", { mode: "number" }),
    netTonnage: numeric("net_tonnage", { mode: "number" }),
    loaMeters: numeric("loa_meters", { mode: "number" }),
    beamMeters: numeric("beam_meters", { mode: "number" }),
    ownerManager: text("owner_manager"),
    hasGears: boolean("has_gears"),
    processStatus: text("process_status"),
    status: text("status"),
    auditStatus: text("audit_status"),
    sourceProvenance: text("source_provenance"),
    origin: text("origen"),
    source: text("source"),
    sourcePayload: jsonb("source_payload"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastUpdatedAt: timestamp("fecha_ultima_actualizacion", { withTimezone: true }),
  },
  (table) => [
    check(
      "vessels_master_gross_tonnage_positive_check",
      sql`${table.grossTonnage} IS NULL OR ${table.grossTonnage} > 0`,
    ),
    check(
      "vessels_master_loa_meters_positive_check",
      sql`${table.loaMeters} IS NULL OR ${table.loaMeters} > 0`,
    ),
    index("vessels_master_mmsi_lookup_idx").on(table.mmsi).where(sql`${table.mmsi} IS NOT NULL`),
  ],
);

export const aisVessels = pgTable("ais_vessels", {
  storageKey: text("storage_key").primaryKey(),
  imoNumber: text("imo_number").notNull(),
  mmsi: text("mmsi"),
  vesselName: text("vessel_name"),
  vesselType: text("vessel_type"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  source: text("source").notNull(),
  auditStatus: text("audit_status").default("PENDING").notNull(),
  rawData: jsonb("raw_data").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dataBridgeVesselSyncs = pgTable("databridge_vessel_syncs", {
  syncId: uuid("sync_id").primaryKey(),
  persistedImoNumbers: jsonb("persisted_imo_numbers").default(sql`'[]'::jsonb`).notNull(),
  rejectedCount: integer("rejected_count").default(0).notNull(),
  createdAt: createdAt(),
});

export const pipelineInbox = pgTable("pipeline_inbox", {
  id: serial("id").primaryKey(),
  syncId: text("sync_id"),
  imoNumber: text("imo_number"),
  vesselName: text("vessel_name"),
  source: text("source").default("CORE_PRO").notNull(),
  status: text("status").default("PENDING").notNull(),
  payload: jsonb("payload").notNull(),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
