CREATE TABLE "calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"caller" text NOT NULL,
	"tier" text,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"symbol" text,
	"price_usd" double precision,
	"market_cap_usd" double precision NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" integer,
	"market_cap_1h" double precision,
	"market_cap_6h" double precision,
	"market_cap_24h" double precision,
	"peak_multiple" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "top_caller_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "calls_user_id_created_at_index" ON "calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "calls_chain_address_created_at_index" ON "calls" USING btree ("chain","address","created_at");