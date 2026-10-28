import { describe, expect, it } from "vitest";
import { findBuys, type EnhancedTx } from "../src/wallets/helius.js";

const W = "WalletTracked1111111111111111111111111111111";
const POOL = "Pool11111111111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";
const MEME = "Meme1111111111111111111111111111111111pump";

describe("findBuys", () => {
  it("spots a SOL-for-token swap even when Helius calls it something else", () => {
    // Same shape as a real BONK swap Helius labelled TOKEN_MINT
    const tx: EnhancedTx = {
      signature: "s",
      tokenTransfers: [
        { mint: WSOL, fromUserAccount: W, toUserAccount: POOL, tokenAmount: 1.5 },
        { mint: MEME, fromUserAccount: POOL, toUserAccount: W, tokenAmount: 1_000_000 },
      ],
    };
    expect(findBuys(tx, new Set([W]))).toEqual([{ wallet: W, mint: MEME }]);
  });

  it("counts native SOL spent", () => {
    const tx: EnhancedTx = {
      signature: "s",
      nativeTransfers: [{ fromUserAccount: W, toUserAccount: POOL, amount: 2_000_000_000 }],
      tokenTransfers: [{ mint: MEME, fromUserAccount: POOL, toUserAccount: W, tokenAmount: 5 }],
    };
    expect(findBuys(tx, new Set([W]))).toHaveLength(1);
  });

  it("ignores sells, plain transfers and wallets we don't track", () => {
    const sell: EnhancedTx = {
      signature: "s",
      tokenTransfers: [
        { mint: MEME, fromUserAccount: W, toUserAccount: POOL, tokenAmount: 5 },
        { mint: WSOL, fromUserAccount: POOL, toUserAccount: W, tokenAmount: 1 },
      ],
    };
    const airdrop: EnhancedTx = { signature: "s", tokenTransfers: [{ mint: MEME, fromUserAccount: POOL, toUserAccount: W, tokenAmount: 5 }] };
    expect(findBuys(sell, new Set([W]))).toEqual([]);
    expect(findBuys(airdrop, new Set([W]))).toEqual([]);
    expect(findBuys(sell, new Set(["someone-else"]))).toEqual([]);
  });
});
