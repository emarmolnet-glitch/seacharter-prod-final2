CREATE TABLE IF NOT EXISTS "voyages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vessel_mmsi" varchar(9) NOT NULL,
  "destination_port_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "is_active" boolean NOT NULL DEFAULT true,
  "arrived_at" timestamp with time zone,
  "nor_distance_nm" numeric(10, 3),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "voyages_vessel_mmsi_format_check" CHECK ("vessel_mmsi" ~ '^[0-9]{9}$'),
  CONSTRAINT "voyages_nor_distance_nonnegative_check" CHECK ("nor_distance_nm" IS NULL OR "nor_distance_nm" >= 0)
);

CREATE INDEX IF NOT EXISTS "voyages_active_destination_lookup_idx"
  ON "voyages" ("vessel_mmsi", "destination_port_id", "updated_at" DESC)
  WHERE "is_active" = true;

CREATE TABLE IF NOT EXISTS "charter_parties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "voyage_id" uuid NOT NULL UNIQUE REFERENCES "voyages" ("id") ON DELETE CASCADE,
  "arrival_timestamp" timestamp with time zone,
  "nor_distance_nm" numeric(10, 3),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "charter_parties_nor_distance_nonnegative_check" CHECK ("nor_distance_nm" IS NULL OR "nor_distance_nm" >= 0)
);
