CREATE TABLE "AppConfig" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "AppConfig" ("key", "value")
VALUES ('scan_status', 'OFF')
ON CONFLICT ("key") DO NOTHING;
