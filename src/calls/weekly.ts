import { gt, eq } from "drizzle-orm";
import { calls, users } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { syncTags } from "../holders.js";
import { tierById } from "../tiers.js";
import { fmtMultiple } from "../alerts/performance.js";
import { rankCallers } from "./leaderboard.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MEDALS = ["🥇", "🥈", "🥉"];

/** Posts the week's top callers and gives #1 the TOP CALLER tag for a week. Only Cabal and up can take the crown. */
export async function weeklyTopCallers(deps: Deps): Promise<string | null> {
  const list = await deps.db.select().from(calls).where(gt(calls.createdAt, new Date(Date.now() - 7 * 24 * 3600_000)));
  const ranked = rankCallers(list);
  if (!ranked.length) return null;

  const eligible = ranked.filter((r) => r.tier === "cabal" || r.tier === "inner");
  const winner = eligible[0];
  if (winner) {
    await deps.db.update(users).set({ topCallerUntil: new Date(Date.now() + 7 * 24 * 3600_000) }).where(eq(users.telegramId, winner.userId));
    const [u] = await deps.db.select({ tier: users.tier }).from(users).where(eq(users.telegramId, winner.userId));
    await syncTags(deps, winner.userId, tierById(u?.tier ?? null));
  }

  const lines = ranked.slice(0, 3).map(
    (r, i) => `${MEDALS[i]} <b>${escape(r.caller)}</b> · ${fmtMultiple(r.median)} median · ${r.hits}/${r.calls} hit 2x · best $${escape(r.best.symbol)} ${fmtMultiple(r.best.peak)}`,
  );
  return [
    "◈ <b>TOP CALLERS</b> · <code>THIS WEEK</code>",
    "",
    ...lines,
    "",
    winner ? `${escape(winner.caller)} wears the <b>TOP CALLER</b> tag this week.` : "Nobody in Cabal or Inner Circle qualified for the tag this week.",
    "<i>Full board: /leaderboard</i>",
  ].join("\n");
}
