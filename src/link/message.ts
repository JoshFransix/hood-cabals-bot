import { randomBytes } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";
import type { ChainClient } from "../chain/client.js";

export const LINK_TTL_MS = 15 * 60 * 1000;

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/** The exact text the wallet signs. Binding the Telegram id stops a signature being replayed for another account. */
export function linkMessage(telegramId: number, nonce: string): string {
  return [
    "Hood Cabals: link this wallet to my Telegram account.",
    "",
    `Telegram ID: ${telegramId}`,
    `Nonce: ${nonce}`,
    "",
    "Signing is free and does not send a transaction.",
  ].join("\n");
}

/**
 * Checks a plain EOA signature locally first, then falls back to the chain so
 * smart-contract wallets (ERC-1271 / ERC-6492) also work.
 */
export async function verifyLinkSignature(
  client: ChainClient | null,
  address: Address,
  message: string,
  signature: Hex,
): Promise<boolean> {
  try {
    if (await verifyMessage({ address, message, signature })) return true;
  } catch {
    // Not a valid ECDSA signature; may still be a smart-wallet one
  }
  if (!client) return false;
  try {
    return await client.verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}
