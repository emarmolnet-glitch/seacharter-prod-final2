import { check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sessionSync = pgTable("session_sync", {
  userId: uuid("user_id").primaryKey(),
  lastSyncData: jsonb("last_sync_data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("session_sync_vessel_array_check", sql`jsonb_typeof(${table.lastSyncData}) = 'array'`),
]);

export const iaReports = pgTable("ia_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull().default("PENDING"),
  requestPayload: jsonb("request_payload").notNull(),
  reportData: jsonb("report_data"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
