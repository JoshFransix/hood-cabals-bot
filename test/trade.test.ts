import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTradeLinks, tradeButtons } from "../src/scan/trade.js";

function withFile(content: unknown) {
  const path = join(mkdtempSync(join(tmpdir(), "trade-")), "trade-links.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe("trade links", () => {
  it("fills the token address into each template", () => {
    const links = loadTradeLinks(withFile({ solana: [{ name: "Axiom", url: "https://example.com/t/{address}/@hc" }] }));
    expect(tradeButtons(links, "solana", "Mint111")).toEqual([{ name: "Axiom", url: "https://example.com/t/Mint111/@hc" }]);
    expect(tradeButtons(links, "robinhood", "0xabc")).toEqual([]);
  });

  it("fills pair links and skips them when there's no pair yet", () => {
    const links = loadTradeLinks(withFile({ solana: [{ name: "Axiom", url: "https://example.com/meme/{pair}?chain=sol" }] }));
    expect(tradeButtons(links, "solana", "Mint111", "Pair222")).toEqual([{ name: "Axiom", url: "https://example.com/meme/Pair222?chain=sol" }]);
    expect(tradeButtons(links, "solana", "Mint111")).toEqual([]);
  });

  it("rejects a link without {address}, so a referral can't silently point at one token", () => {
    expect(() => loadTradeLinks(withFile({ solana: [{ name: "X", url: "https://example.com/r/hc" }] }))).toThrow(/address/);
  });

  it("treats a missing file as no buttons", () => {
    expect(loadTradeLinks("/nope/trade-links.json")).toEqual({});
  });
});
