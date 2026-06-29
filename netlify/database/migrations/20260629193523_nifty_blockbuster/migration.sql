CREATE TABLE "vesselsMaster" (
	"imoNumber" varchar(32) PRIMARY KEY,
	"mmsi" varchar(32),
	"vesselName" varchar(256),
	"shipType" varchar(128),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"speed" double precision,
	"course" double precision,
	"heading" double precision,
	"navigationalStatus" varchar(128),
	"destination" varchar(256),
	"eta" varchar(64),
	"source" varchar(64) DEFAULT 'AISStream' NOT NULL,
	"rawData" jsonb NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vesselsMaster_imoNumber_unique" ON "vesselsMaster" ("imoNumber");--> statement-breakpoint
CREATE INDEX "vesselsMaster_lastSeenAt_idx" ON "vesselsMaster" ("lastSeenAt");--> statement-breakpoint
CREATE INDEX "vesselsMaster_position_idx" ON "vesselsMaster" ("latitude","longitude");