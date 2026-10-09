CREATE TABLE "multimodal_operations" (
	"id" serial PRIMARY KEY,
	"referencia" varchar(100) NOT NULL,
	"modalidad" varchar(100) NOT NULL,
	"coste_api" numeric(12,2) NOT NULL,
	"venta_agencia" numeric(12,2) NOT NULL,
	"fee_plataforma" numeric(12,2) DEFAULT '50.00' NOT NULL,
	"estado" varchar(50) DEFAULT 'Cotizado' NOT NULL,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
