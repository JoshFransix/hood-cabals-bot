// Sanity-checks NFT_CONTRACT on the configured chain.
// Usage: npm run check:contract [-- 0xWalletToCheck]
import { erc721Abi, parseAbi, type Address } from "viem";
import { createChainClient } from "../src/chain/client.js";
import { loadConfig } from "../src/config.js";

// Only the chain settings matter here, so fill the rest with placeholders
const config = loadConfig({
  ...process.env,
  BOT_TOKEN: process.env.BOT_TOKEN || "unused",
  DATABASE_URL: process.env.DATABASE_URL || "postgres://unused/x",
  PUBLIC_URL: process.env.PUBLIC_URL || "http://localhost",
});
const client = createChainClient(config);
const address = config.NFT_CONTRACT as Address;
const extra = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function supportsInterface(bytes4) view returns (bool)",
]);

async function read<T>(label: string, fn: () => Promise<T>) {
  try {
    console.log(label.padEnd(16), await fn());
  } catch (err) {
    console.log(label.padEnd(16), "ERROR", (err as { shortMessage?: string }).shortMessage ?? err);
  }
}

console.log(`RPC ${config.RPC_URL}, contract ${address}\n`);
await read("chain id", () => client.getChainId());
await read("has code", async () => ((await client.getCode({ address })) ?? "0x").length > 2);
await read("name", () => client.readContract({ address, abi: erc721Abi, functionName: "name" }));
await read("symbol", () => client.readContract({ address, abi: erc721Abi, functionName: "symbol" }));
await read("totalSupply", () => client.readContract({ address, abi: extra, functionName: "totalSupply" }));
await read("is ERC-721", () => client.readContract({ address, abi: extra, functionName: "supportsInterface", args: ["0x80ac58cd"] }));

const wallet = process.argv[2] as Address | undefined;
if (wallet) {
  await read("balanceOf", () => client.readContract({ address, abi: erc721Abi, functionName: "balanceOf", args: [wallet] }));
}
