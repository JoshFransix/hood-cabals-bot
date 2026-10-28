import type { Deps } from "../deps.js";
import { scans } from "../db/schema.js";
import { goplusChainId } from "./chains.js";
import { fallbackChain, type AddressKind } from "./detect.js";
import { assessRisk } from "./risk.js";
import { chainsByLiquidity, fetchAllPairs, fetchMarket, type DexPair } from "./sources/dexscreener.js";
import { fetchGoplusSecurity } from "./sources/goplus.js";
import { fetchSolanaSecurity } from "./sources/rugcheck.js";
import type { ScanChain, ScanResult, SecurityData } from "./types.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: Promise<FullScan | null> }>();

export type FullScan = ScanResult & { missing: string[] };

export interface ScanRequest {
  kind: AddressKind;
  address: string;
  /** Set on Rescan, so the card stays on the chain it was showing */
  chain?: ScanChain;
}

/**
 * Scans a token, sharing one in-flight lookup between everyone who asks within a minute.
 * Resolves to null when no DEX knows the address and its chain can't be guessed.
 */
export function scanToken(deps: Deps, req: ScanRequest, opts: { fresh?: boolean } = {}): Promise<FullScan | null> {
  const key = `${req.chain ?? "auto"}:${req.address}`;
  const hit = cache.get(key);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const result = runScan(deps, req);
  cache.set(key, { at: Date.now(), result });
  result.catch(() => cache.delete(key));
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
  }
  return result;
}

async function runScan(deps: Deps, req: ScanRequest): Promise<FullScan | null> {
  const { address } = req;
  const missing: string[] = [];
  const soft = async <T>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (err) {
      deps.log.warn({ err, address, source: label }, "scan source failed");
      missing.push(label);
      return null;
    }
  };

  // Where does this token trade? The deepest chain wins; the rest are listed on the card.
  let pairs: DexPair[] | undefined;
  let chain = req.chain;
  let otherChains: string[] = [];
  if (!chain) {
    pairs = (await soft("market data", fetchAllPairs(address))) ?? undefined;
    const ranked = pairs ? chainsByLiquidity(pairs) : [];
    chain = ranked[0] ?? fallbackChain(req.kind, address) ?? undefined;
    otherChains = ranked.slice(1);
  }
  if (!chain) return null;

  const market = await soft("market data", fetchMarket(chain, address, pairs));
  let security: SecurityData | null = null;
  const goplus = goplusChainId(chain);
  if (chain === "solana") security = await soft("security data", fetchSolanaSecurity(address));
  // GoPlus lists the pool as a top holder, so it needs the pair address to leave it out
  else if (goplus) security = await soft("security data", fetchGoplusSecurity(goplus, address, market?.pairAddress));

  return {
    chain,
    address,
    market,
    security,
    risk: assessRisk(market, security),
    otherChains,
    scannedAt: new Date(),
    missing: [...new Set(missing)],
  };
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
