CREATE TABLE "link_requests" (
	"nonce" text PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"telegram_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"wallet" text,
	"nft_count" integer DEFAULT 0 NOT NULL,
	"tier" text,
	"linked_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_wallet_unique" UNIQUE("wallet")
);
