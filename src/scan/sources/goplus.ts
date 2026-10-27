import { getJson } from "../http.js";
import type { SecurityData } from "../types.js";

interface Holder {
  address: string;
  percent: string;
  is_locked: number;
  tag?: string;
  NFT_list?: unknown[];
}

interface TokenSecurity {
  holder_count?: string;
  is_mintable?: string;
  owner_address?: string | null;
  is_honeypot?: string;
  buy_tax?: string;
  sell_tax?: string;
  transfer_pausable?: string;
  hidden_owner?: string;
  can_take_back_ownership?: string;
  creator_percent?: string;
  holders?: Holder[];
  lp_holders?: Holder[];
}

const ROBINHOOD_CHAIN_ID = 4663;
const BURN = /^0x0{40}$|^0x0{36}dead$/i;

const flag = (v: string | undefined) => (v === undefined || v === "" ? undefined : v === "1");
const pct = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v) * 100);

export async function fetchEvmSecurity(address: string, pairAddress?: string): Promise<SecurityData | null> {
  const body = await getJson<{ code: number; message: string; result?: Record<string, TokenSecurity> }>(
    `https://api.gopluslabs.io/api/v1/token_security/${ROBINHOOD_CHAIN_ID}?contract_addresses=${address}`,
  );
  if (body.code !== 1) throw new Error(`GoPlus: ${body.message}`);
  const t = body.result?.[address.toLowerCase()];
  if (!t) return null;

  const pair = pairAddress?.toLowerCase();
  const top10 = (t.holders ?? [])
    .filter((h) => h.address.toLowerCase() !== pair && !BURN.test(h.address) && !h.is_locked)
    .slice(0, 10);
  const lpLocked = (t.lp_holders ?? [])
    .filter((h) => h.is_locked || BURN.test(h.address))
    .reduce((sum, h) => sum + Number(h.percent) * 100, 0);

  const lpHolders = t.lp_holders ?? [];
  const lpPositions = lpHolders.some((h) => h.NFT_list?.length);
  const lpTop = lpHolders
    .filter((h) => !h.is_locked && !BURN.test(h.address))
    .reduce((max, h) => Math.max(max, Number(h.percent) * 100), 0);

  const flags: string[] = [];
  if (flag(t.can_take_back_ownership)) flags.push("Owner can reclaim ownership");

  return {
    source: "goplus",
    holders: t.holder_count ? Number(t.holder_count) : undefined,
    top10Pct: top10.length ? top10.reduce((sum, h) => sum + Number(h.percent) * 100, 0) : undefined,
    creatorPct: pct(t.creator_percent),
    lpLockedPct: lpHolders.length ? lpLocked : undefined,
    lpPositions,
    lpTopHolderPct: lpHolders.length ? lpTop : undefined,
    mintable: flag(t.is_mintable),
    ownerRenounced: t.owner_address === undefined ? undefined : !t.owner_address || BURN.test(t.owner_address),
    honeypot: flag(t.is_honeypot),
    buyTaxPct: pct(t.buy_tax),
    sellTaxPct: pct(t.sell_tax),
    pausable: flag(t.transfer_pausable),
    hiddenOwner: flag(t.hidden_owner),
    flags,
  };
}
