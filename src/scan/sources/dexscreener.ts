import { getJson } from "../http.js";
import type { MarketData, ScanChain } from "../types.js";

interface Pair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  pairCreatedAt?: number;
}

const CHAIN_IDS: Record<ScanChain, string> = { solana: "solana", robinhood: "robinhood" };

/** Uses the deepest pair where the token is the base asset, which is what traders look at. */
export async function fetchMarket(chain: ScanChain, address: string): Promise<MarketData | null> {
  const pairs = await getJson<Pair[]>(`https://api.dexscreener.com/tokens/v1/${CHAIN_IDS[chain]}/${address}`);
  const own = pairs.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase());
  const pair = (own.length ? own : pairs).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (!pair) return null;
  return {
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    marketCapUsd: pair.marketCap ?? pair.fdv,
    liquidityUsd: pair.liquidity?.usd,
    volume24hUsd: pair.volume?.h24,
    priceChange24hPct: pair.priceChange?.h24,
    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : undefined,
    pairAddress: pair.pairAddress,
    dex: pair.dexId,
    url: pair.url,
  };
}
