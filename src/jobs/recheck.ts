import { isNotNull, lt } from "drizzle-orm";
import { linkRequests, users } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { refreshHolder } from "../holders.js";

// Keeps the public RPC happy; drop it once you're on a paid endpoint
const DELAY_MS = 250;

export async function recheckAll(deps: Deps) {
  const rows = await deps.db.select({ telegramId: users.telegramId }).from(users).where(isNotNull(users.wallet));
  let failed = 0;
  for (const { telegramId } of rows) {
    try {
      // syncTags also covers members who joined before tags existed or had theirs edited by hand
      await refreshHolder(deps, telegramId, { notify: true, syncTags: true });
    } catch (err) {
      failed++;
      deps.log.warn({ err, telegramId }, "recheck failed");
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  await deps.db.delete(linkRequests).where(lt(linkRequests.expiresAt, new Date(Date.now() - 24 * 3600_000)));
  deps.log.info({ checked: rows.length, failed }, "holder recheck done");
}
