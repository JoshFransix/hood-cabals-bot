import { describe, expect, it } from "vitest";
import { detectChain, findAddress } from "../src/scan/detect.js";
import { assessRisk } from "../src/scan/risk.js";
import type { MarketData, SecurityData } from "../src/scan/types.js";

const healthyMarket: MarketData = { liquidityUsd: 250_000, pairCreatedAt: new Date("2026-01-01") };
const cleanSol: SecurityData = { source: "rugcheck", mintable: false, freezable: false, top10Pct: 18, lpLockedPct: 100, flags: [] };

describe("assessRisk", () => {
  it("rates a clean, liquid token LOW", () => {
    expect(assessRisk(healthyMarket, cleanSol).level).toBe("LOW");
  });

  it("rates a honeypot HIGH on its own", () => {
    const r = assessRisk(healthyMarket, { source: "goplus", honeypot: true, flags: [] });
    expect(r.level).toBe("HIGH");
    expect(r.reasons[0]).toMatch(/Honeypot/);
  });

  it("stacks medium issues", () => {
    const r = assessRisk({ liquidityUsd: 12_000, pairCreatedAt: new Date("2026-01-01") }, { ...cleanSol, top10Pct: 42 });
    expect(r.level).toBe("MEDIUM");
    expect(r.reasons).toEqual(expect.arrayContaining(["Liquidity under $20K", "Top 10 hold 42%"]));
  });

  it("flags active mint and freeze authority", () => {
    expect(assessRisk(healthyMarket, { ...cleanSol, mintable: true, freezable: true }).level).toBe("HIGH");
  });

  it("treats brand-new pairs with caution", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const r = assessRisk({ liquidityUsd: 50_000, pairCreatedAt: new Date("2026-10-27T11:30:00Z") }, cleanSol, now);
    expect(r.reasons).toContain("Pair is under 1 hour old");
  });

  it("judges v3 liquidity by who controls it, not by locks", () => {
    const v3 = { source: "goplus" as const, lpPositions: true, lpLockedPct: 0, flags: [] };
    expect(assessRisk(healthyMarket, { ...v3, lpTopHolderPct: 83 }).reasons).toContain("One wallet controls 83% of liquidity");
    expect(assessRisk(healthyMarket, { ...v3, lpTopHolderPct: 20 }).reasons).toEqual(["Liquidity positions aren't locked"]);
  });

  it("calls out pump.fun bonding-curve tokens instead of 'no pair'", () => {
    const r = assessRisk(null, { ...cleanSol, lpLockedPct: 0, onBondingCurve: true });
    expect(r.reasons).toEqual(["Still on the pump.fun bonding curve"]);
    expect(r.level).toBe("LOW");
  });

  it("doesn't call a token with a handful of holders LOW", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const fresh = { liquidityUsd: 50_000, pairCreatedAt: new Date("2026-10-27T11:59:00Z") };
    expect(assessRisk(fresh, { ...cleanSol, holders: 7 }, now).level).toBe("MEDIUM");
  });

  it("won't rate a token LOW when the security check failed", () => {
    const r = assessRisk(healthyMarket, null);
    expect(r.level).toBe("UNKNOWN");
    expect(r.reasons).toContain("Security check unavailable");
  });

  it("is UNKNOWN with no data at all", () => {
    expect(assessRisk(null, null).level).toBe("UNKNOWN");
  });
});

describe("detectChain", () => {
  it("routes EVM addresses to Robinhood Chain, lowercased", () => {
    expect(detectChain("0x3F5e952b29bE5D70846FC2bA472BeA05761A769E")).toEqual({
      chain: "robinhood",
      address: "0x3f5e952b29be5d70846fc2ba472bea05761a769e",
    });
  });

  it("routes base58 addresses to Solana", () => {
    expect(detectChain("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")?.chain).toBe("solana");
  });

  it("rejects junk", () => {
    expect(detectChain("hello")).toBeNull();
    expect(detectChain("0x123")).toBeNull();
  });

  it("finds a pump.fun mint inside a pasted call", () => {
    const text = "dev wallet 9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw ca: 7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmpump";
    expect(findAddress(text)).toBe("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmpump");
  });
});
