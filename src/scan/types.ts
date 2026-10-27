export type ScanChain = "solana" | "robinhood";

export interface MarketData {
  name?: string;
  symbol?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  priceChange24hPct?: number;
  priceChange1hPct?: number;
  buys1h?: number;
  sells1h?: number;
  socials?: { label: string; url: string }[];
  /** Dev paid DEXScreener for a profile or boosts */
  dexPaid?: boolean;
  pairCreatedAt?: Date;
  pairAddress?: string;
  dex?: string;
  url?: string;
}

/** Normalised security facts. Undefined means the source didn't say, not "safe". */
export interface SecurityData {
  source: "rugcheck" | "goplus";
  holders?: number;
  /** Share of supply held by the 10 largest wallets, pools and burn addresses excluded (0-100) */
  top10Pct?: number;
  /** The five largest individual holders, in percent */
  top5?: number[];
  creatorPct?: number;
  /** Wallets RugCheck links into insider networks, and the share of supply they hold */
  insiderWallets?: number;
  insiderPct?: number;
  lpLockedPct?: number;
  /** Liquidity is held as Uniswap v3/v4 NFT positions rather than lockable LP tokens */
  lpPositions?: boolean;
  /** Share of liquidity controlled by the single largest LP holder (0-100) */
  lpTopHolderPct?: number;
  /** Solana token still trading on the pump.fun bonding curve, not a DEX yet */
  onBondingCurve?: boolean;
  mintable?: boolean;
  freezable?: boolean;
  ownerRenounced?: boolean;
  honeypot?: boolean;
  buyTaxPct?: number;
  sellTaxPct?: number;
  pausable?: boolean;
  hiddenOwner?: boolean;
  /** Source-specific red flags worth showing verbatim */
  flags: string[];
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface Risk {
  level: RiskLevel;
  score: number;
  reasons: string[];
}

export interface ScanResult {
  chain: ScanChain;
  address: string;
  market: MarketData | null;
  security: SecurityData | null;
  risk: Risk;
  scannedAt: Date;
}
