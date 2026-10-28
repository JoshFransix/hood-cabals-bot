// Chain ids are DEXScreener's. `goplus` is the GoPlus chain id where it has security data.
interface ChainInfo {
  label: string;
  goplus?: string;
}

const CHAINS: Record<string, ChainInfo> = {
  solana: { label: "SOLANA" },
  robinhood: { label: "ROBINHOOD", goplus: "4663" },
  ethereum: { label: "ETHEREUM", goplus: "1" },
  bsc: { label: "BSC", goplus: "56" },
  base: { label: "BASE", goplus: "8453" },
  arbitrum: { label: "ARBITRUM", goplus: "42161" },
  polygon: { label: "POLYGON", goplus: "137" },
  optimism: { label: "OPTIMISM", goplus: "10" },
  avalanche: { label: "AVALANCHE", goplus: "43114" },
  linea: { label: "LINEA", goplus: "59144" },
  zksync: { label: "ZKSYNC", goplus: "324" },
  scroll: { label: "SCROLL", goplus: "534352" },
  mantle: { label: "MANTLE", goplus: "5000" },
  blast: { label: "BLAST", goplus: "81457" },
  sonic: { label: "SONIC", goplus: "146" },
  berachain: { label: "BERACHAIN", goplus: "80094" },
  unichain: { label: "UNICHAIN", goplus: "130" },
  abstract: { label: "ABSTRACT", goplus: "2741" },
  worldchain: { label: "WORLD CHAIN", goplus: "480" },
  monad: { label: "MONAD", goplus: "143" },
  cronos: { label: "CRONOS", goplus: "25" },
  opbnb: { label: "OPBNB", goplus: "204" },
  tron: { label: "TRON", goplus: "tron" },
};

export function chainLabel(chain: string): string {
  return CHAINS[chain]?.label ?? chain.toUpperCase();
}

export function goplusChainId(chain: string): string | undefined {
  return CHAINS[chain]?.goplus;
}
