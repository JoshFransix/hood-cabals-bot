import type { Config } from "./config.js";

export const TIERS = [
  { id: "hood", name: "Hood", minNfts: 1 },
  { id: "cabal", name: "Cabal", minNfts: 3 },
  { id: "inner", name: "Inner Circle", minNfts: 10 },
] as const;

export type TierId = (typeof TIERS)[number]["id"];
export type Tier = (typeof TIERS)[number];

/** Highest tier the NFT count qualifies for, or null below the first threshold. */
export function tierFor(nftCount: number): Tier | null {
  let best: Tier | null = null;
  for (const tier of TIERS) {
    if (nftCount >= tier.minNfts) best = tier;
  }
  return best;
}

export function tierById(id: string | null): Tier | null {
  return TIERS.find((t) => t.id === id) ?? null;
}

function rank(id: TierId | null): number {
  return id ? TIERS.findIndex((t) => t.id === id) + 1 : 0;
}

/** A tier unlocks its own group and every group below it. */
export function canAccess(userTier: TierId | null, groupTier: TierId): boolean {
  return rank(userTier) >= rank(groupTier);
}

export interface TierGroup {
  tier: Tier;
  chatId: number;
}

export function tierGroups(config: Config): TierGroup[] {
  const ids: Record<TierId, number | undefined> = {
    hood: config.TIER_HOOD_CHAT_ID,
    cabal: config.TIER_CABAL_CHAT_ID,
    inner: config.TIER_INNER_CHAT_ID,
  };
  return TIERS.flatMap((tier) => {
    const chatId = ids[tier.id];
    return chatId === undefined ? [] : [{ tier, chatId }];
  });
}
