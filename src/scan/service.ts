import type { Deps } from "../deps.js";
import { scans } from "../db/schema.js";
import { assessRisk } from "./risk.js";
import { fetchMarket } from "./sources/dexscreener.js";
import { fetchEvmSecurity } from "./sources/goplus.js";
import { fetchSolanaSecurity } from "./sources/rugcheck.js";
import type { MarketData, ScanChain, ScanResult, SecurityData } from "./types.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: Promise<ScanResult & { missing: string[] }> }>();

export type FullScan = ScanResult & { missing: string[] };

/**
 * Scans a token, sharing one in-flight lookup between everyone who asks within a minute.
 * A failing source leaves its part empty instead of failing the scan.
 */
export function scanToken(deps: Deps, chain: ScanChain, address: string, opts: { fresh?: boolean } = {}): Promise<FullScan> {
  const key = `${chain}:${address}`;
  const hit = cache.get(key);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const result = runScan(deps, chain, address);
  cache.set(key, { at: Date.now(), result });
  result.catch(() => cache.delete(key));
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
  }
  return result;
}

async function runScan(deps: Deps, chain: ScanChain, address: string): Promise<FullScan> {
  const missing: string[] = [];
  const soft = async <T>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (err) {
      deps.log.warn({ err, chain, address, source: label }, "scan source failed");
      missing.push(label);
      return null;
    }
  };

  let market: MarketData | null;
  let security: SecurityData | null;
  if (chain === "solana") {
    [market, security] = await Promise.all([
      soft("market data", fetchMarket(chain, address)),
      soft("security data", fetchSolanaSecurity(address)),
    ]);
  } else {
    // GoPlus lists the pool as a top holder, so it needs the pair address to leave it out
    market = await soft("market data", fetchMarket(chain, address));
    security = await soft("security data", fetchEvmSecurity(address, market?.pairAddress));
  }

  return { chain, address, market, security, risk: assessRisk(market, security), scannedAt: new Date(), missing };
}

export async function recordScan(deps: Deps, scan: ScanResult, requestedBy: number | undefined, chatId: number) {
  await deps.db
    .insert(scans)
    .values({
      chain: scan.chain,
      address: scan.address,
      symbol: scan.market?.symbol,
      requestedBy,
      chatId,
      priceUsd: scan.market?.priceUsd,
      marketCapUsd: scan.market?.marketCapUsd,
      liquidityUsd: scan.market?.liquidityUsd,
      riskLevel: scan.risk.level,
      riskScore: scan.risk.score,
    })
    .catch((err) => deps.log.warn({ err }, "could not record scan"));
}
