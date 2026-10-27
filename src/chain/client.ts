import { createPublicClient, defineChain, erc721Abi, http, type Address } from "viem";
import type { Config } from "../config.js";

export function createChainClient(config: Config) {
  const chain = defineChain({
    id: config.CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.RPC_URL] } },
  });
  return createPublicClient({ chain, transport: http(config.RPC_URL, { retryCount: 3 }) });
}

export type ChainClient = ReturnType<typeof createChainClient>;

export async function nftBalance(
  client: ChainClient,
  contract: Address,
  owner: Address,
): Promise<number> {
  const balance = await client.readContract({
    address: contract,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  return Number(balance);
}
