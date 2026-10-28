CREATE TABLE "alert_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" integer NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" integer NOT NULL,
	"is_room" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"symbol" text,
	"source" text NOT NULL,
	"detail" text,
	"risk_level" text NOT NULL,
	"price_usd" double precision,
	"market_cap_usd" double precision,
	"liquidity_usd" double precision,
	"market_cap_1h" double precision,
	"market_cap_6h" double precision,
	"market_cap_24h" double precision,
	"peak_multiple" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"chain" text,
	"source" text NOT NULL,
	"detail" text,
	"outcome" text NOT NULL,
	"alert_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"label" text NOT NULL,
	"added_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_wallets_chain_address_unique" UNIQUE("chain","address")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alerts_dm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "alerts_chain_address_created_at_index" ON "alerts" USING btree ("chain","address","created_at");--> statement-breakpoint
CREATE INDEX "signals_address_created_at_index" ON "signals" USING btree ("address","created_at");