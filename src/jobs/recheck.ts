import { isNotNull, lt } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { linkRequests, users } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { refreshHolder } from "../holders.js";

const QUEUE = "recheck-holders";
// Keeps the public RPC happy; drop it once you're on a paid endpoint
const DELAY_MS = 250;

export async function recheckAll(deps: Deps) {
  const rows = await deps.db.select({ telegramId: users.telegramId }).from(users).where(isNotNull(users.wallet));
  let failed = 0;
  for (const { telegramId } of rows) {
    try {
      await refreshHolder(deps, telegramId, { notify: true });
    } catch (err) {
      failed++;
      deps.log.warn({ err, telegramId }, "recheck failed");
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await deps.db.delete(linkRequests).where(lt(linkRequests.expiresAt, new Date(Date.now() - 24 * 3600_000)));
  deps.log.info({ checked: rows.length, failed }, "holder recheck done");
}

/** pg-boss keeps the schedule in Postgres, so there's no Redis to run. */
export async function startJobs(deps: Deps) {
  const boss = new PgBoss(deps.config.DATABASE_URL);
  boss.on("error", (err) => deps.log.error({ err }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(QUEUE);
  await boss.schedule(QUEUE, deps.config.RECHECK_CRON, null, { tz: "UTC" });
  await boss.work(QUEUE, async () => recheckAll(deps));
  return boss;
}
