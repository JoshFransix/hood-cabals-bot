import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ScanChain } from "./types.js";

const link = z.object({
  name: z.string().min(1).max(16),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") && u.includes("{address}"), "must be https and contain {address}"),
});
const file = z.object({ solana: z.array(link).default([]), robinhood: z.array(link).default([]) });

export type TradeLinks = z.infer<typeof file>;

/**
 * Trade buttons come from trade-links.json so referral links can change without code changes.
 * Each url is a real token link copied from the platform with the token address swapped for {address}.
 */
export function loadTradeLinks(path = join(process.cwd(), "trade-links.json")): TradeLinks {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { solana: [], robinhood: [] };
  }
  const parsed = file.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid trade-links.json:\n${issues}`);
  }
  return parsed.data;
}

export function tradeButtons(links: TradeLinks, chain: ScanChain, address: string) {
  return links[chain].map((l) => ({ name: l.name, url: l.url.replaceAll("{address}", address) }));
}
