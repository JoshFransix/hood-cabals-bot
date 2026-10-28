import { and, eq } from "drizzle-orm";
import { GrammyError, InlineKeyboard } from "grammy";
import { alertMessages, alerts, users, type Alert } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { parseAddress } from "../scan/detect.js";
import { scanToken, type FullScan } from "../scan/service.js";
import { getTradeLinks, tradeButtons } from "../scan/trade.js";
import { scanCard } from "../scan/view.js";
import { tierById } from "../tiers.js";
import type { WaveTier } from "./pipeline.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Telegram allows about 30 messages a second overall; stay well under it
const DM_GAP_MS = 60;

function sourceLine(alert: Alert): string {
  if (alert.source === "wallet") return `TRACKED WALLET${alert.detail ? ` · ${alert.detail.toUpperCase()}` : ""} BOUGHT`;
  return "CABAL CALL FEED";
}

export function alertCard(alert: Alert, scan: FullScan, tier: WaveTier, delayMin: number) {
  const card = scanCard(scan, tradeButtons(getTradeLinks(), scan.chain, scan.address, scan.market?.pairAddress));
  const head = [`🚨 <b>ALERT</b> · <code>${escape(sourceLine(alert))}</code>`];
  // Later waves see how far behind they are, which is the reason to climb a tier
  if (tier !== "inner" && delayMin > 0) head.push(`<i>Inner Circle got this ${delayMin} min ago.</i>`);
  return { text: `${head.join("\n")}\n\n${card.text}`, keyboard: card.keyboard };
}

/** Posts one tier's wave: that tier's room, plus DMs to that tier's members who turned alerts on. */
export async function deliverWave(deps: Deps, alertId: number, tier: WaveTier) {
  const [alert] = await deps.db.select().from(alerts).where(eq(alerts.id, alertId));
  if (!alert) return;
  const parsed = parseAddress(alert.address);
  if (!parsed) return;
  const scan = await scanToken(deps, { ...parsed, chain: alert.chain });
  if (!scan) return;

  const delayMin = tier === "cabal" ? deps.config.ALERT_DELAY_CABAL_MIN : tier === "hood" ? deps.config.ALERT_DELAY_HOOD_MIN : 0;
  const card = alertCard(alert, scan, tier, delayMin);
  const send = (chatId: number, keyboard: InlineKeyboard) =>
    deps.api.sendMessage(chatId, card.text, { parse_mode: "HTML", reply_markup: keyboard, link_preview_options: { is_disabled: true } });

  const room = deps.groups.find((g) => g.tier.id === tier);
  if (room) {
    try {
      const msg = await send(room.chatId, card.keyboard);
      await deps.db.insert(alertMessages).values({ alertId, chatId: room.chatId, messageId: msg.message_id, isRoom: true });
    } catch (err) {
      deps.log.warn({ err, alertId, tier }, "room alert failed");
    }
  }

  const subscribers = await deps.db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(and(eq(users.alertsDm, true), eq(users.tier, tier)));
  for (const { telegramId } of subscribers) {
    try {
      await send(telegramId, card.keyboard);
    } catch (err) {
      // They blocked the bot; stop trying
      if (err instanceof GrammyError && err.error_code === 403) {
        await deps.db.update(users).set({ alertsDm: false }).where(eq(users.telegramId, telegramId));
      }
    }
    await new Promise((r) => setTimeout(r, DM_GAP_MS));
  }
  deps.log.info({ alertId, tier: tierById(tier)?.name, dms: subscribers.length }, "alert wave sent");
}
