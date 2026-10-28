import { and, eq, gt } from "drizzle-orm";
import { alertMessages, alerts, type Alert } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { fetchMarket } from "../scan/sources/dexscreener.js";
import { fmtUsd } from "../scan/view.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const COLUMN = { 1: "marketCap1h", 6: "marketCap6h", 24: "marketCap24h" } as const;
// Follow-ups only for moves worth talking about
const FOLLOW_UP_AT = 2;

export function fmtMultiple(x: number): string {
  return x >= 10 ? `${Math.round(x)}x` : `${x.toFixed(1)}x`;
}

/** Records market cap at a checkpoint and, on a 2x or better, replies under the original alert in each room. */
export async function checkAlert(deps: Deps, alertId: number, hours: 1 | 6 | 24) {
  const [alert] = await deps.db.select().from(alerts).where(eq(alerts.id, alertId));
  if (!alert?.marketCapUsd) return;
  const market = await fetchMarket(alert.chain, alert.address).catch(() => null);
  // A token that vanished from DEXScreener has effectively gone to zero
  const now = market?.marketCapUsd ?? 0;
  const multiple = now / alert.marketCapUsd;
  const peak = Math.max(alert.peakMultiple ?? 0, multiple);

  await deps.db
    .update(alerts)
    .set({ [COLUMN[hours]]: now, peakMultiple: peak })
    .where(eq(alerts.id, alertId));

  if (multiple < FOLLOW_UP_AT) return;
  const text = `📈 <b>$${escape(alert.symbol ?? "?")}</b> is up <b>${fmtMultiple(multiple)}</b> since the alert · ${fmtUsd(alert.marketCapUsd)} → ${fmtUsd(now)} in ${hours}h`;
  const posts = await deps.db
    .select()
    .from(alertMessages)
    .where(and(eq(alertMessages.alertId, alertId), eq(alertMessages.isRoom, true)));
  for (const post of posts) {
    await deps.api
      .sendMessage(post.chatId, text, { parse_mode: "HTML", reply_parameters: { message_id: post.messageId, allow_sending_without_reply: true } })
      .catch((err) => deps.log.warn({ err, alertId }, "follow-up failed"));
  }
}

export interface RecapStats {
  total: number;
  hits: number;
  medianPeak: number;
  rows: { symbol: string; peak: number; day: number | null }[];
}

/** Hit = reached 2x at any checkpoint. Losers stay in: a recap that hides misses isn't worth reading. */
export function recapStats(list: Alert[]): RecapStats {
  const rows = list
    .filter((a) => a.marketCapUsd)
    .map((a) => ({
      symbol: a.symbol ?? "?",
      peak: a.peakMultiple ?? 0,
      day: a.marketCap24h !== null ? a.marketCap24h / a.marketCapUsd! : null,
    }))
    .sort((a, b) => b.peak - a.peak);
  const peaks = rows.map((r) => r.peak).sort((a, b) => a - b);
  const mid = Math.floor(peaks.length / 2);
  const medianPeak = peaks.length ? (peaks.length % 2 ? peaks[mid]! : (peaks[mid - 1]! + peaks[mid]!) / 2) : 0;
  return { total: rows.length, hits: rows.filter((r) => r.peak >= FOLLOW_UP_AT).length, medianPeak, rows };
}

export function recapText(stats: RecapStats): string {
  const rate = stats.total ? Math.round((stats.hits / stats.total) * 100) : 0;
  const width = Math.max(...stats.rows.map((r) => r.symbol.length + 1), 6) + 2;
  const table = stats.rows
    .slice(0, 20)
    .map((r) => `${`$${r.symbol}`.padEnd(width)}${fmtMultiple(r.peak).padStart(6)}  ${r.day === null ? "—" : fmtMultiple(r.day)}`)
    .join("\n");
  return [
    "◈ <b>WEEKLY RECAP</b>",
    `<code>${stats.total} ALERTS / ${stats.hits} HIT 2X+ / ${rate}%</code>`,
    "",
    `<pre>${escape(`${"TOKEN".padEnd(width)}${"PEAK".padStart(6)}  24H\n${table}`)}</pre>`,
    `Median peak ${fmtMultiple(stats.medianPeak)}. Every alert from the last 7 days is listed, misses included.`,
    "",
    "<i>Peak is the best of the 1h, 6h and 24h checks. Not financial advice.</i>",
  ].join("\n");
}

/** Monday post: the alert recap, then the week's top callers. Either is skipped if there's nothing to show. */
export async function weeklyRecap(deps: Deps, topCallers: (deps: Deps) => Promise<string | null>) {
  const list = await deps.db.select().from(alerts).where(gt(alerts.createdAt, new Date(Date.now() - 7 * 24 * 3600_000)));
  const posts = [list.length ? recapText(recapStats(list)) : null, await topCallers(deps)].filter((p): p is string => p !== null);
  const chats = [...deps.groups.map((g) => g.chatId), ...(deps.config.COMMUNITY_CHAT_ID !== undefined ? [deps.config.COMMUNITY_CHAT_ID] : [])];
  for (const text of posts) {
    for (const chatId of chats) {
      await deps.api.sendMessage(chatId, text, { parse_mode: "HTML" }).catch((err) => deps.log.warn({ err, chatId }, "recap failed"));
    }
  }
}
