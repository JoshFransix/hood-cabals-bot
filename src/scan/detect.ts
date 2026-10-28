export type AddressKind = "evm" | "base58" | "ton";

const EVM = /^0x[0-9a-fA-F]{40}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TON = /^(EQ|UQ)[A-Za-z0-9_-]{46}$/;

/** Recognises a token address by its shape. Which chain it lives on is resolved later from DEX data. */
export function parseAddress(input: string): { kind: AddressKind; address: string } | null {
  const address = input.trim();
  if (EVM.test(address)) return { kind: "evm", address: address.toLowerCase() };
  if (BASE58.test(address)) return { kind: "base58", address };
  if (TON.test(address)) return { kind: "ton", address };
  return null;
}

/** Finds the first token address in free text, e.g. a pasted call. Prefers pump.fun mints. */
export function findAddress(text: string): string | null {
  const evm = text.match(/0x[0-9a-fA-F]{40}/)?.[0];
  if (evm) return evm;
  const sol = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) ?? [];
  return sol.find((a) => a.endsWith("pump")) ?? sol[0] ?? text.match(/\b(EQ|UQ)[A-Za-z0-9_-]{46}\b/)?.[0] ?? null;
}

/** Best guess when no DEX knows the token yet: base58 is Solana unless it has Tron's shape. */
export function fallbackChain(kind: AddressKind, address: string): string | null {
  if (kind === "base58") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) ? "tron" : "solana";
  if (kind === "ton") return "ton";
  return null;
}
