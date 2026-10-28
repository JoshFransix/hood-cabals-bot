import { fmtMultiple } from "../alerts/performance.js";
import type { Call } from "../db/schema.js";
import { tierById } from "../tiers.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const MIN_CALLS = 3;
const HIT = 2;

export interface CallerRow {
  userId: number;
  caller: string;
  tier: string | null;
  calls: number;
  hits: number;
  median: number;
  best: { symbol: string; peak: number };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Ranks callers by the median peak of their calls, so consistency beats one lucky moonshot.
 * Calls younger than the first checkpoint aren't scored yet. Callers need MIN_CALLS scored calls.
 */
export function rankCallers(list: Call[], minCalls = MIN_CALLS): CallerRow[] {
  const byUser = new Map<number, Call[]>();
  for (const c of list) {
    if (c.peakMultiple === null) continue;
    byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);
  }
  const rows: CallerRow[] = [];
  for (const [userId, cs] of byUser) {
    if (cs.length < minCalls) continue;
    const latest = cs.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    const best = cs.reduce((a, b) => (a.peakMultiple! >= b.peakMultiple! ? a : b));
    rows.push({
      userId,
      caller: latest.caller,
      tier: latest.tier,
      calls: cs.length,
      hits: cs.filter((c) => c.peakMultiple! >= HIT).length,
      median: median(cs.map((c) => c.peakMultiple!)),
      best: { symbol: best.symbol ?? "?", peak: best.peakMultiple! },
    });
  }
  return rows.sort((a, b) => b.median - a.median || b.hits - a.hits || b.calls - a.calls);
}

export const PERIODS = { "7d": 7, "30d": 30, all: null } as const;
export type Period = keyof typeof PERIODS;

export function leaderboardText(rows: CallerRow[], period: Period): string {
  const label = period === "all" ? "ALL TIME" : `${PERIODS[period]} DAYS`;
  if (!rows.length) {
    return `◈ <b>LEADERBOARD</b> · <code>${label}</code>\n\nNobody has ${MIN_CALLS} scored calls yet. Calls are scored from 1h after they're made. Use /call &lt;address&gt; in the rooms.`;
  }
  const top = rows.slice(0, 15);
  const nameW = Math.min(14, Math.max(6, ...top.map((r) => r.caller.length)));
  const lines = top.map((r, i) => {
    const name = r.caller.length > nameW ? `${r.caller.slice(0, nameW - 1)}…` : r.caller;
    const tier = tierById(r.tier)?.name.split(" ")[0]!.slice(0, 5).toUpperCase() ?? "—";
    const hit = `${Math.round((r.hits / r.calls) * 100)}%`;
    return `${String(i + 1).padStart(2)} ${name.padEnd(nameW)} ${tier.padEnd(5)} ${String(r.calls).padStart(3)} ${hit.padStart(4)} ${fmtMultiple(r.median).padStart(5)}`;
  });
  const header = `${" #"} ${"CALLER".padEnd(nameW)} ${"TIER".padEnd(5)} ${"N".padStart(3)} ${"HIT".padStart(4)} ${"MED".padStart(5)}`;
  const leader = top[0]!;
  return [
    `◈ <b>LEADERBOARD</b> · <code>${label}</code>`,
    "",
    `<pre>${escape([header, ...lines].join("\n"))}</pre>`,
    `🏆 ${escape(leader.caller)} leads with a ${fmtMultiple(leader.median)} median. Best call: $${escape(leader.best.symbol)} ${fmtMultiple(leader.best.peak)}.`,
    "",
    `<i>Ranked by median peak of each call (1h, 6h, 24h checks). HIT = reached 2x. Min ${MIN_CALLS} calls. Rewards are for Cabal and Inner Circle.</i>`,
  ].join("\n");
}
