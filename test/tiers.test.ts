import { describe, expect, it } from "vitest";
import { canAccess, tierFor } from "../src/tiers.js";

describe("tierFor", () => {
  it.each([
    [0, null],
    [1, "hood"],
    [2, "hood"],
    [3, "hood"],
    [4, "hood"],
    [5, "cabal"],
    [9, "cabal"],
    [10, "inner"],
    [250, "inner"],
  ])("%i NFTs -> %s", (count, expected) => {
    expect(tierFor(count)?.id ?? null).toBe(expected);
  });
});

describe("canAccess", () => {
  it("opens the tier's own room and every room below it", () => {
    expect(canAccess("cabal", "hood")).toBe(true);
    expect(canAccess("cabal", "cabal")).toBe(true);
    expect(canAccess("cabal", "inner")).toBe(false);
    expect(canAccess(null, "hood")).toBe(false);
  });
});
