import { bigint, doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  username: text("username"),
  wallet: text("wallet").unique(),
  nftCount: integer("nft_count").notNull().default(0),
  tier: text("tier"),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const linkRequests = pgTable("link_requests", {
  nonce: text("nonce").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// Every scan is kept so later phases (alerts, call log) can compare against
// the market cap at the time someone looked at a token
export const scans = pgTable("scans", {
  id: serial("id").primaryKey(),
  chain: text("chain").notNull(),
  address: text("address").notNull(),
  symbol: text("symbol"),
  requestedBy: bigint("requested_by", { mode: "number" }),
  chatId: bigint("chat_id", { mode: "number" }),
  priceUsd: doublePrecision("price_usd"),
  marketCapUsd: doublePrecision("market_cap_usd"),
  liquidityUsd: doublePrecision("liquidity_usd"),
  riskLevel: text("risk_level").notNull(),
  riskScore: integer("risk_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
