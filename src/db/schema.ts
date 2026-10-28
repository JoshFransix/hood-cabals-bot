import { bigint, boolean, doublePrecision, index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  username: text("username"),
  wallet: text("wallet").unique(),
  nftCount: integer("nft_count").notNull().default(0),
  tier: text("tier"),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  // Holders opt in to alert DMs with /alerts
  alertsDm: boolean("alerts_dm").notNull().default(false),
  // Weekly #1 caller wears the TOP CALLER tag until this time
  topCallerUntil: timestamp("top_caller_until", { withTimezone: true }),
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

export const trackedWallets = pgTable(
  "tracked_wallets",
  {
    id: serial("id").primaryKey(),
    chain: text("chain").notNull(),
    address: text("address").notNull(),
    label: text("label").notNull(),
    addedBy: bigint("added_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.chain, t.address)],
);

// Everything that might become an alert, kept even when it doesn't, so we can see what got filtered and why
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    address: text("address").notNull(),
    chain: text("chain"),
    source: text("source").notNull(),
    detail: text("detail"),
    outcome: text("outcome").notNull(),
    alertId: integer("alert_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.address, t.createdAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: serial("id").primaryKey(),
    chain: text("chain").notNull(),
    address: text("address").notNull(),
    symbol: text("symbol"),
    source: text("source").notNull(),
    detail: text("detail"),
    riskLevel: text("risk_level").notNull(),
    priceUsd: doublePrecision("price_usd"),
    marketCapUsd: doublePrecision("market_cap_usd"),
    liquidityUsd: doublePrecision("liquidity_usd"),
    // Market cap at each checkpoint, and the best multiple seen at any of them
    marketCap1h: doublePrecision("market_cap_1h"),
    marketCap6h: doublePrecision("market_cap_6h"),
    marketCap24h: doublePrecision("market_cap_24h"),
    peakMultiple: doublePrecision("peak_multiple"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.chain, t.address, t.createdAt)],
);

export const alertMessages = pgTable("alert_messages", {
  id: serial("id").primaryKey(),
  alertId: integer("alert_id").notNull(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  messageId: integer("message_id").notNull(),
  // Only room posts get follow-ups; DMs stay quiet after the first message
  isRoom: boolean("is_room").notNull(),
});

// Member calls (/call). Same checkpoint idea as alerts, ranked per caller on the leaderboard.
export const calls = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    // Name and tier as they were at call time, so the board doesn't change when someone renames
    caller: text("caller").notNull(),
    tier: text("tier"),
    chain: text("chain").notNull(),
    address: text("address").notNull(),
    symbol: text("symbol"),
    priceUsd: doublePrecision("price_usd"),
    marketCapUsd: doublePrecision("market_cap_usd").notNull(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    messageId: integer("message_id"),
    marketCap1h: doublePrecision("market_cap_1h"),
    marketCap6h: doublePrecision("market_cap_6h"),
    marketCap24h: doublePrecision("market_cap_24h"),
    peakMultiple: doublePrecision("peak_multiple"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.chain, t.address, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
