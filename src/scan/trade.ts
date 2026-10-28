import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ScanChain } from "./types.js";

const link = z.object({
  name: z.string().min(1).max(16),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") && /\{(address|pair)\}/.test(u), "must be https and contain {address} or {pair}"),
});
// Keyed by DEXScreener chain id ("solana", "base", "bsc", ...); chains without an entry get no buttons
const file = z.record(z.string(), z.array(link));

export type TradeLinks = z.infer<typeof file>;

/**
 * Trade buttons come from trade-links.json so referral links can change without code changes.
 * Each url is a real token link copied from the platform with the token address swapped for {address},
 * or the pair address for {pair} on platforms that open pairs (Axiom).
 */
export function loadTradeLinks(path = join(process.cwd(), "trade-links.json")): TradeLinks {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  const parsed = file.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid trade-links.json:\n${issues}`);
  }
  return parsed.data;
}

export function tradeButtons(links: TradeLinks, chain: ScanChain, address: string, pair?: string) {
  return (links[chain] ?? [])
    .filter((l) => pair || !l.url.includes("{pair}"))
    .map((l) => ({ name: l.name, url: l.url.replaceAll("{address}", address).replaceAll("{pair}", pair ?? "") }));
}
