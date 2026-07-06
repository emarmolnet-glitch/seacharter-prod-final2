import { integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const externalPriorityRecords = pgTable("external_priority_records", {
  id: serial().primaryKey(),
  source: text().notNull().default("commercial_nlp"),
  priority: integer().notNull().default(100),
  status: text().notNull().default("pending_databridge"),
  vesselName: text("vessel_name").notNull(),
  imo: text().notNull().default("N/A"),
  openCountry: text("open_country").notNull().default("N/A"),
  dwt: integer().notNull().default(0),
  pol: text().notNull().default("N/A"),
  pod: text().notNull().default("N/A"),
  cargoQuantity: numeric("cargo_quantity").notNull().default("0"),
  laycan: text().notNull().default("N/A"),
  ownerCost: numeric("owner_cost").notNull().default("0"),
  ownerInternalPrice: numeric("owner_internal_price").notNull().default("0"),
  chartererSaleFreight: numeric("charterer_sale_freight").notNull().default("0"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
