CREATE TABLE "scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"symbol" text,
	"requested_by" bigint,
	"chat_id" bigint,
	"price_usd" double precision,
	"market_cap_usd" double precision,
	"liquidity_usd" double precision,
	"risk_level" text NOT NULL,
	"risk_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
