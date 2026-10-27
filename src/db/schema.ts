import { bigint, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

export type User = typeof users.$inferSelect;
