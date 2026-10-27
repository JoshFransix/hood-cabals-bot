import type { ScanChain } from "./types.js";

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Works out the chain from the address shape. EVM addresses are Robinhood Chain, the only EVM chain we scan. */
export function detectChain(input: string): { chain: ScanChain; address: string } | null {
  const address = input.trim();
  if (EVM.test(address)) return { chain: "robinhood", address: address.toLowerCase() };
  if (SOLANA.test(address)) return { chain: "solana", address };
  return null;
}

/** Finds the first token address in free text, e.g. a pasted call. Prefers pump.fun mints. */
export function findAddress(text: string): string | null {
  const evm = text.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (evm) return evm;
  const sol = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) ?? [];
  return sol.find((a) => a.endsWith("pump")) ?? sol[0] ?? null;
}
