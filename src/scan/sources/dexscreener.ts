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
  priceChange?: { h1?: number; h24?: number };
  txns?: { h1?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
  info?: { websites?: { label?: string; url: string }[]; socials?: { type: string; url: string }[] };
}

interface Orders {
  orders?: { type: string; status: string }[];
  boosts?: unknown[];
}

const SOCIAL_LABELS: Record<string, string> = { twitter: "X", telegram: "TG", discord: "Discord" };

const CHAIN_IDS: Record<ScanChain, string> = { solana: "solana", robinhood: "robinhood" };

/** Uses the deepest pair where the token is the base asset, which is what traders look at. */
export async function fetchMarket(chain: ScanChain, address: string): Promise<MarketData | null> {
  const [pairs, orders] = await Promise.all([
    getJson<Pair[]>(`https://api.dexscreener.com/tokens/v1/${CHAIN_IDS[chain]}/${address}`),
    getJson<Orders>(`https://api.dexscreener.com/orders/v1/${CHAIN_IDS[chain]}/${address}`).catch(() => null),
  ]);
  const own = pairs.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase());
  const pair = (own.length ? own : pairs).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (!pair) return null;

  const socials = [
    ...(pair.info?.socials ?? []).map((s) => ({ label: SOCIAL_LABELS[s.type] ?? s.type, url: s.url })),
    ...(pair.info?.websites ?? []).slice(0, 1).map((w) => ({ label: "Web", url: w.url })),
  ].filter((s) => s.url.startsWith("https://"));

  return {
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    marketCapUsd: pair.marketCap ?? pair.fdv,
    liquidityUsd: pair.liquidity?.usd,
    volume24hUsd: pair.volume?.h24,
    priceChange24hPct: pair.priceChange?.h24,
    priceChange1hPct: pair.priceChange?.h1,
    buys1h: pair.txns?.h1?.buys,
    sells1h: pair.txns?.h1?.sells,
    socials,
    dexPaid: orders ? (orders.orders ?? []).some((o) => o.status === "approved") || (orders.boosts ?? []).length > 0 : undefined,
    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : undefined,
    pairAddress: pair.pairAddress,
    dex: pair.dexId,
    url: pair.url,
  };
}
