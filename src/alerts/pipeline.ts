import { and, eq, gt } from "drizzle-orm";
import { alerts, signals } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { parseAddress } from "../scan/detect.js";
import { scanToken, type FullScan } from "../scan/service.js";
import { deliverWave } from "./deliver.js";

export interface Signal {
  address: string;
  source: "intake" | "wallet";
  /** Wallet label, or where the call came from */
  detail?: string;
  /** Known chain, e.g. "solana" for a Helius wallet buy; otherwise resolved from DEX data */
  chain?: string;
}

const DEDUPE_MS = 24 * 3600_000;
// Inner Circle goes first; the delays for the other tiers come from config
export const WAVES = ["inner", "cabal", "hood"] as const;
export type WaveTier = (typeof WAVES)[number];
const CHECKPOINTS_H = [1, 6, 24];

// Two tracked wallets often buy the same token within seconds; only the first gets through
const inFlight = new Set<string>();

/** Why a scanned token isn't alert-worthy, or null if it is. */
export function rejectReason(scan: FullScan, minLiquidity: number): string | null {
  if (scan.risk.level === "HIGH") return "rejected:high-risk";
  if (scan.risk.level === "UNKNOWN") return "rejected:unknown-risk";
  // Bonding-curve tokens have no pool yet, so judge them on market cap instead
  const depth = scan.security?.onBondingCurve ? scan.market?.marketCapUsd : scan.market?.liquidityUsd;
  if ((depth ?? 0) < minLiquidity) return "rejected:low-liquidity";
  return null;
}

/**
 * Turns a CA from the relay or a wallet buy into an alert: dedupe, scan, filter, then schedule
 * the tier waves and performance checks. Every signal is logged with its outcome.
 */
export async function submitSignal(deps: Deps, signal: Signal): Promise<{ outcome: string; alertId?: number }> {
  const parsed = parseAddress(signal.address);
  const log = async (outcome: string, chain?: string, alertId?: number) => {
    await deps.db.insert(signals).values({
      address: parsed?.address ?? signal.address,
      chain: chain ?? signal.chain,
      source: signal.source,
      detail: signal.detail,
      outcome,
      alertId,
    });
    deps.log.info({ address: signal.address, source: signal.source, outcome }, "signal");
    return { outcome, alertId };
  };
  if (!parsed) return log("invalid");
  if (inFlight.has(parsed.address)) return log("duplicate");

  inFlight.add(parsed.address);
  try {
    const [recent] = await deps.db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.address, parsed.address), gt(alerts.createdAt, new Date(Date.now() - DEDUPE_MS))))
      .limit(1);
    if (recent) return log("duplicate", undefined, recent.id);

    const scan = await scanToken(deps, { ...parsed, chain: signal.chain });
    if (!scan) return log("not-found");
    const reject = rejectReason(scan, deps.config.ALERT_MIN_LIQUIDITY);
    if (reject) return log(reject, scan.chain);

    const [alert] = await deps.db
      .insert(alerts)
      .values({
        chain: scan.chain,
        address: scan.address,
        symbol: scan.market?.symbol,
        source: signal.source,
        detail: signal.detail,
        riskLevel: scan.risk.level,
        priceUsd: scan.market?.priceUsd,
        marketCapUsd: scan.market?.marketCapUsd,
        liquidityUsd: scan.market?.liquidityUsd,
      })
      .returning({ id: alerts.id });
    const alertId = alert!.id;

    const delayMin: Record<WaveTier, number> = {
      inner: 0,
      cabal: deps.config.ALERT_DELAY_CABAL_MIN,
      hood: deps.config.ALERT_DELAY_HOOD_MIN,
    };
    // Inner Circle is sent right here: going through the queue would cost a couple of polling seconds
    await deliverWave(deps, alertId, "inner").catch((err) => deps.log.error({ err, alertId }, "inner wave failed"));
    for (const tier of WAVES.filter((t) => t !== "inner")) {
      await deps.jobs?.send("alert-wave", { alertId, tier }, { startAfter: delayMin[tier] * 60, singletonKey: `${alertId}:${tier}` });
    }
    for (const hours of CHECKPOINTS_H) {
      await deps.jobs?.send("alert-check", { alertId, hours }, { startAfter: hours * 3600, singletonKey: `${alertId}:${hours}h` });
    }
    return log("alerted", scan.chain, alertId);
  } finally {
    inFlight.delete(parsed.address);
  }
}
