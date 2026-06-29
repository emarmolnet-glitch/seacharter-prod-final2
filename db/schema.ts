import { index, jsonb, pgTable, timestamp, uniqueIndex, varchar, doublePrecision } from "drizzle-orm/pg-core";

export const vesselsMaster = pgTable(
  "vesselsMaster",
  {
    imoNumber: varchar("imoNumber", { length: 32 }).primaryKey(),
    mmsi: varchar("mmsi", { length: 32 }),
    vesselName: varchar("vesselName", { length: 256 }),
    shipType: varchar("shipType", { length: 128 }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    speed: doublePrecision("speed"),
    course: doublePrecision("course"),
    heading: doublePrecision("heading"),
    navigationalStatus: varchar("navigationalStatus", { length: 128 }),
    destination: varchar("destination", { length: 256 }),
    eta: varchar("eta", { length: 64 }),
    source: varchar("source", { length: 64 }).notNull().default("AISStream"),
    rawData: jsonb("rawData").notNull(),
    lastSeenAt: timestamp("lastSeenAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vesselsMaster_imoNumber_unique").on(table.imoNumber),
    index("vesselsMaster_lastSeenAt_idx").on(table.lastSeenAt),
    index("vesselsMaster_position_idx").on(table.latitude, table.longitude),
  ],
);
