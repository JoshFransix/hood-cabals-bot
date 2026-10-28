import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { trackedWallets } from "../db/schema.js";
import type { Deps } from "../deps.js";

export const HELIUS_WEBHOOK_PATH = "/hooks/helius";
const API = "https://api.helius.xyz/v0";

// SOL, wrapped SOL and stables: spending these and receiving something else is a buy
const QUOTE_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

export interface EnhancedTx {
  signature: string;
  tokenTransfers?: { mint: string; fromUserAccount?: string | null; toUserAccount?: string | null; tokenAmount: number }[];
  nativeTransfers?: { fromUserAccount?: string | null; toUserAccount?: string | null; amount: number }[];
}

/** Helius sends this back in the Authorization header, so we know a webhook call is really from our webhook. */
export function webhookSecret(botToken: string): string {
  return createHash("sha256").update(`helius:${botToken}`).digest("hex").slice(0, 40);
}

/**
 * Finds tracked wallets that bought a token in this transaction. Uses net token movements rather than
 * Helius's transaction type, which mislabels plenty of aggregator swaps.
 */
export function findBuys(tx: EnhancedTx, tracked: Set<string>): { wallet: string; mint: string }[] {
  const net = new Map<string, Map<string, number>>();
  const bump = (wallet: string | null | undefined, mint: string, amount: number) => {
    if (!wallet || !tracked.has(wallet)) return;
    const m = net.get(wallet) ?? new Map<string, number>();
    m.set(mint, (m.get(mint) ?? 0) + amount);
    net.set(wallet, m);
  };
  for (const t of tx.tokenTransfers ?? []) {
    bump(t.toUserAccount, t.mint, t.tokenAmount);
    bump(t.fromUserAccount, t.mint, -t.tokenAmount);
  }
  for (const n of tx.nativeTransfers ?? []) {
    bump(n.toUserAccount, "SOL", n.amount);
    bump(n.fromUserAccount, "SOL", -n.amount);
  }

  const buys: { wallet: string; mint: string }[] = [];
  for (const [wallet, mints] of net) {
    const spentQuote = [...mints].some(([mint, amt]) => (mint === "SOL" || QUOTE_MINTS.has(mint)) && amt < 0);
    if (!spentQuote) continue;
    for (const [mint, amt] of mints) {
      if (amt > 0 && mint !== "SOL" && !QUOTE_MINTS.has(mint)) buys.push({ wallet, mint });
    }
  }
  return buys;
}

async function helius<T>(deps: Deps, method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}api-key=${deps.config.HELIUS_API_KEY}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Helius ${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/**
 * Keeps one Helius webhook pointed at this bot, watching every tracked Solana wallet.
 * Called on startup and whenever the wallet list changes.
 */
export async function syncHeliusWebhook(deps: Deps): Promise<string> {
  if (!deps.config.HELIUS_API_KEY) return "Helius key not set; wallet tracking is off.";
  if (!deps.config.PUBLIC_URL.startsWith("https://")) return "PUBLIC_URL isn't https, so Helius can't reach the bot yet.";

  const url = `${deps.config.PUBLIC_URL}${HELIUS_WEBHOOK_PATH}`;
  const wallets = (await deps.db.select({ address: trackedWallets.address }).from(trackedWallets).where(eq(trackedWallets.chain, "solana"))).map(
    (w) => w.address,
  );
  const hooks = await helius<{ webhookID: string; webhookURL: string }[]>(deps, "GET", "/webhooks");
  const existing = hooks.find((h) => h.webhookURL === url);

  if (wallets.length === 0) {
    if (existing) await helius(deps, "DELETE", `/webhooks/${existing.webhookID}`);
    return "No Solana wallets tracked.";
  }
  const body = {
    webhookURL: url,
    webhookType: "enhanced",
    transactionTypes: ["ANY"],
    accountAddresses: wallets,
    authHeader: webhookSecret(deps.config.BOT_TOKEN),
  };
  if (existing) await helius(deps, "PUT", `/webhooks/${existing.webhookID}`, body);
  else await helius(deps, "POST", "/webhooks", body);
  return `Watching ${wallets.length} Solana wallet${wallets.length === 1 ? "" : "s"}.`;
}
