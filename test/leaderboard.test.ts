import { describe, expect, it } from "vitest";
import { leaderboardText, rankCallers } from "../src/calls/leaderboard.js";
import type { Call } from "../src/db/schema.js";

let n = 0;
const call = (userId: number, caller: string, tier: string, peak: number | null, symbol = "TKN"): Call =>
  ({ id: ++n, userId, caller, tier, symbol, peakMultiple: peak, marketCapUsd: 1, createdAt: new Date(2026, 9, n) }) as Call;

describe("rankCallers", () => {
  it("ranks steady callers above one lucky moonshot", () => {
    const steady = [2.1, 2.4, 1.9, 2.2].map((p) => call(1, "@steady", "cabal", p));
    const lucky = [50, 0.3, 0.2, 0.4].map((p) => call(2, "@lucky", "inner", p));
    const rows = rankCallers([...steady, ...lucky]);
    expect(rows.map((r) => r.caller)).toEqual(["@steady", "@lucky"]);
    expect(rows[1]!.best).toEqual({ symbol: "TKN", peak: 50 });
  });

  it("skips unscored calls and callers under the minimum", () => {
    const rows = rankCallers([call(1, "@a", "hood", 3), call(1, "@a", "hood", 3), call(1, "@a", "hood", null), call(3, "@b", "hood", 2), call(3, "@b", "hood", 2), call(3, "@b", "hood", 2)]);
    expect(rows.map((r) => r.caller)).toEqual(["@b"]);
  });

  it("counts 2x+ peaks as hits", () => {
    const [row] = rankCallers([1, 2, 5].map((p) => call(4, "@c", "hood", p)));
    expect(row).toMatchObject({ calls: 3, hits: 2, median: 2 });
  });
});

describe("leaderboardText", () => {
  it("explains how to get on the board when it's empty", () => {
    expect(leaderboardText([], "7d")).toContain("Nobody has 3 scored calls yet");
  });

  it("escapes names", () => {
    const rows = rankCallers([1, 2, 3].map((p) => call(5, "<b>evil</b>", "cabal", p)));
    expect(leaderboardText(rows, "all")).not.toContain("<b>evil");
  });
});
