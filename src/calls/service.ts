import { and, asc, eq, gt } from "drizzle-orm";
import { fmtMultiple } from "../alerts/performance.js";
import { calls, type Call } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { scanToken, type FullScan, type ScanRequest } from "../scan/service.js";
import { fetchMarket } from "../scan/sources/dexscreener.js";
import { fmtUsd } from "../scan/view.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DAILY_LIMIT = 10;
const COLUMN = { 1: "marketCap1h", 6: "marketCap6h", 24: "marketCap24h" } as const;

export interface Caller {
  id: number;
  name: string;
  tier: string | null;
}

export type CallResult =
  | { ok: false; reason: string }
  | { ok: true; call: Call; scan: FullScan; first: Call | null };

/** Records a member's call at the current market cap and schedules its checkpoints. */
export async function makeCall(deps: Deps, caller: Caller, req: ScanRequest, chatId: number, messageId?: number): Promise<CallResult> {
  const today = await deps.db
    .select({ address: calls.address })
    .from(calls)
    .where(and(eq(calls.userId, caller.id), gt(calls.createdAt, new Date(Date.now() - 24 * 3600_000))));
  if (today.length >= DAILY_LIMIT) return { ok: false, reason: `You've made ${DAILY_LIMIT} calls in the last 24h. Quality over quantity.` };

  const scan = await scanToken(deps, req);
  if (!scan?.market?.marketCapUsd) return { ok: false, reason: "Can't find a market cap for that token yet, so there's nothing to score the call against." };
  if (today.some((c) => c.address === scan.address)) {
    return { ok: false, reason: `You already called $${scan.market.symbol ?? "this"} in the last 24h.` };
  }

  const [first] = await deps.db
    .select()
    .from(calls)
    .where(and(eq(calls.chain, scan.chain), eq(calls.address, scan.address)))
    .orderBy(asc(calls.createdAt))
    .limit(1);

  const [call] = await deps.db
    .insert(calls)
    .values({
      userId: caller.id,
      caller: caller.name,
      tier: caller.tier,
      chain: scan.chain,
      address: scan.address,
      symbol: scan.market.symbol,
      priceUsd: scan.market.priceUsd,
      marketCapUsd: scan.market.marketCapUsd,
      chatId,
      messageId,
    })
    .returning();

  for (const hours of [1, 6, 24]) {
    await deps.jobs?.send("call-check", { callId: call!.id, hours }, { startAfter: hours * 3600, singletonKey: `call:${call!.id}:${hours}h` });
  }
  return { ok: true, call: call!, scan, first: first ?? null };
}

export function callHeader(result: Extract<CallResult, { ok: true }>, tierName: string | null): string {
  const { call, first, scan } = result;
  const lines = [`📣 <b>CALL</b> · <code>${escape(call.caller)}${tierName ? ` · ${tierName.toUpperCase()}` : ""}</code>`];
  if (!first) lines.push(`🔥 <b>First call</b> at ${fmtUsd(call.marketCapUsd)}`);
  else {
    const since = first.marketCapUsd ? (scan.market?.marketCapUsd ?? 0) / first.marketCapUsd : 0;
    lines.push(`First called by ${escape(first.caller)} at ${fmtUsd(first.marketCapUsd)}${since ? ` · ${fmtMultiple(since)} since` : ""}. Logged at ${fmtUsd(call.marketCapUsd)}.`);
  }
  return lines.join("\n");
}

/** Scores a call at a checkpoint; a 2x or better gets a reply under the call in the room it was made. */
export async function checkCall(deps: Deps, callId: number, hours: 1 | 6 | 24) {
  const [call] = await deps.db.select().from(calls).where(eq(calls.id, callId));
  if (!call) return;
  const market = await fetchMarket(call.chain, call.address).catch(() => null);
  const now = market?.marketCapUsd ?? 0;
  const multiple = now / call.marketCapUsd;
  await deps.db
    .update(calls)
    .set({ [COLUMN[hours]]: now, peakMultiple: Math.max(call.peakMultiple ?? 0, multiple) })
    .where(eq(calls.id, callId));

  // Groups have negative ids; DMs stay quiet
  if (multiple < 2 || call.chatId > 0) return;
  await deps.api
    .sendMessage(
      call.chatId,
      `📈 <b>${escape(call.caller)}</b>'s call on <b>$${escape(call.symbol ?? "?")}</b> is up <b>${fmtMultiple(multiple)}</b> · ${fmtUsd(call.marketCapUsd)} → ${fmtUsd(now)} in ${hours}h`,
      { parse_mode: "HTML", reply_parameters: call.messageId ? { message_id: call.messageId, allow_sending_without_reply: true } : undefined },
    )
    .catch((err) => deps.log.warn({ err, callId }, "call follow-up failed"));
}
