import { eq } from "drizzle-orm";
import { createPublicClient, erc20Abi, http, parseAbiItem, type Address, type PublicClient } from "viem";
import { submitSignal, type Signal } from "../alerts/pipeline.js";
import type { Config } from "../config.js";
import { trackedWallets } from "../db/schema.js";
import type { Deps } from "../deps.js";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// Receiving one of these is the other side of a sell, not a buy. Matched by symbol so it works on any chain.
const QUOTE_SYMBOLS = new Set(["ETH", "WETH", "USDC", "USDC.E", "USDBC", "USDT", "USDG", "DAI", "USDS", "FDUSD", "BNB", "WBNB", "WPOL", "WMATIC", "WAVAX", "WS"]);
const POLL_MS = 15_000;
// Most public RPCs accept a few thousand blocks per log query
const MAX_RANGE = 2_000n;

/** Robinhood Chain uses the main RPC_URL; other EVM chains come from EVM_RPCS. */
export function evmRpcs(config: Config): Record<string, string> {
  return { robinhood: config.RPC_URL, ...config.EVM_RPCS };
}

export interface EvmBuy {
  chain: string;
  wallet: string;
  token: string;
  tx: string;
}

/**
 * Watches tracked EVM wallets by polling each chain for token transfers into them. A buy is a transfer
 * into a wallet, inside a transaction that wallet sent itself, of a token that isn't ETH or a stablecoin.
 * The same address is watched on every configured chain.
 */
export class EvmWalletWatcher {
  private clients = new Map<string, PublicClient>();
  private lastBlock = new Map<string, bigint>();
  private symbols = new Map<string, string>();
  private running = false;

  constructor(
    private deps: Deps,
    private onBuy: (buy: EvmBuy, label: string) => Promise<unknown> = (buy, label) =>
      submitSignal(deps, { address: buy.token, source: "wallet", detail: label, chain: buy.chain } satisfies Signal),
  ) {
    for (const [chain, url] of Object.entries(evmRpcs(deps.config))) {
      this.clients.set(chain, createPublicClient({ transport: http(url, { retryCount: 2, timeout: 15_000 }) }) as PublicClient);
    }
  }

  get chains(): string[] {
    return [...this.clients.keys()];
  }

  start() {
    const timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
    return () => clearInterval(timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const wallets = await this.deps.db.select().from(trackedWallets).where(eq(trackedWallets.chain, "evm"));
      if (wallets.length === 0) return;
      const labels = new Map(wallets.map((w) => [w.address.toLowerCase(), w.label]));
      for (const chain of this.clients.keys()) {
        await this.pollChain(chain, labels).catch((err) => this.deps.log.warn({ err: err.message, chain }, "evm poll failed"));
      }
    } finally {
      this.running = false;
    }
  }

  /** Scans new blocks on one chain. Pass a range to replay history (tests); otherwise it continues where it left off. */
  async pollChain(chain: string, labels: Map<string, string>, range?: { from: bigint; to: bigint }): Promise<EvmBuy[]> {
    const client = this.clients.get(chain)!;
    const latest = range?.to ?? (await client.getBlockNumber());
    const last = this.lastBlock.get(chain);
    // First run starts from now rather than replaying old buys
    if (!range && last === undefined) {
      this.lastBlock.set(chain, latest);
      return [];
    }
    let from = range?.from ?? last! + 1n;
    if (from > latest) return [];
    if (latest - from > MAX_RANGE * 5n) from = latest - MAX_RANGE * 5n; // after downtime, skip stale history

    const wallets = [...labels.keys()] as Address[];
    const buys: EvmBuy[] = [];
    const seen = new Set<string>();
    const txFrom = new Map<string, string>();

    for (let start = from; start <= latest; start += MAX_RANGE) {
      const end = start + MAX_RANGE - 1n < latest ? start + MAX_RANGE - 1n : latest;
      const logs = await client.getLogs({ event: TRANSFER, args: { to: wallets }, fromBlock: start, toBlock: end });
      for (const log of logs) {
        const wallet = log.args.to!.toLowerCase();
        const token = log.address.toLowerCase();
        const key = `${log.transactionHash}:${token}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let sender = txFrom.get(log.transactionHash);
        if (!sender) {
          sender = (await client.getTransaction({ hash: log.transactionHash })).from.toLowerCase();
          txFrom.set(log.transactionHash, sender);
        }
        // Someone else sent it: an airdrop or a transfer, not a buy
        if (sender !== wallet) continue;
        if (QUOTE_SYMBOLS.has((await this.symbol(client, token)).toUpperCase())) continue;

        const buy = { chain, wallet, token, tx: log.transactionHash };
        buys.push(buy);
        await this.onBuy(buy, labels.get(wallet) ?? wallet).catch((err) => this.deps.log.error({ err, buy }, "evm signal failed"));
      }
    }
    if (!range) this.lastBlock.set(chain, latest);
    return buys;
  }

  private async symbol(client: PublicClient, token: string): Promise<string> {
    let sym = this.symbols.get(token);
    if (sym === undefined) {
      sym = await client.readContract({ address: token as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => "");
      this.symbols.set(token, sym);
    }
    return sym;
  }
}
