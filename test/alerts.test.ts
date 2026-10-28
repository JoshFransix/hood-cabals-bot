import { describe, expect, it } from "vitest";
import { recapStats, recapText } from "../src/alerts/performance.js";
import { rejectReason } from "../src/alerts/pipeline.js";
import type { Alert } from "../src/db/schema.js";
import type { FullScan } from "../src/scan/service.js";

const scan = (over: Partial<FullScan> = {}): FullScan => ({
  chain: "solana",
  address: "x",
  market: { liquidityUsd: 50_000, marketCapUsd: 200_000 },
  security: { source: "rugcheck", flags: [] },
  risk: { level: "LOW", score: 0, reasons: [] },
  otherChains: [],
  scannedAt: new Date(),
  missing: [],
  ...over,
});

describe("rejectReason", () => {
  it("lets a clean, liquid token through", () => {
    expect(rejectReason(scan(), 10_000)).toBeNull();
  });
  it("never alerts HIGH or UNKNOWN risk", () => {
    expect(rejectReason(scan({ risk: { level: "HIGH", score: 9, reasons: [] } }), 10_000)).toBe("rejected:high-risk");
    expect(rejectReason(scan({ risk: { level: "UNKNOWN", score: 0, reasons: [] } }), 10_000)).toBe("rejected:unknown-risk");
  });
  it("skips thin liquidity", () => {
    expect(rejectReason(scan({ market: { liquidityUsd: 4_000 } }), 10_000)).toBe("rejected:low-liquidity");
  });
  it("judges bonding-curve tokens on market cap, since they have no pool", () => {
    const curve = scan({ market: { marketCapUsd: 30_000 }, security: { source: "rugcheck", onBondingCurve: true, flags: [] } });
    expect(rejectReason(curve, 10_000)).toBeNull();
  });
});

describe("weekly recap", () => {
  const alert = (symbol: string, peak: number, day: number | null): Alert =>
    ({ symbol, marketCapUsd: 100, peakMultiple: peak, marketCap24h: day === null ? null : day * 100 }) as Alert;

  it("counts 2x+ peaks as hits and keeps the misses", () => {
    const stats = recapStats([alert("WIN", 5.3, 3), alert("OK", 2, 1.1), alert("MISS", 0.8, 0.2), alert("NEW", 1.2, null)]);
    expect(stats).toMatchObject({ total: 4, hits: 2, medianPeak: 1.6 });
    expect(stats.rows.map((r) => r.symbol)).toEqual(["WIN", "OK", "NEW", "MISS"]);
    const text = recapText(stats);
    expect(text).toContain("4 ALERTS / 2 HIT 2X+ / 50%");
    expect(text).toContain("$MISS");
  });
});
