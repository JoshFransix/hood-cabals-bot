import { getJson } from "../http.js";
import type { SecurityData } from "../types.js";

interface Report {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  creator?: string;
  creatorBalance?: number;
  token?: { supply?: number };
  topHolders?: { address: string; owner: string; pct: number }[];
  graphInsidersDetected?: number;
  insiderNetworks?: { size: number; currentHolding?: number }[] | null;
  knownAccounts?: Record<string, { name: string; type: string }>;
  totalHolders?: number;
  rugged?: boolean;
  risks?: { name: string; level: string }[];
  markets?: { marketType?: string }[];
}

interface Summary {
  lpLockedPct?: number;
}

// Pools, lockers and burn accounts aren't "holders" in the sense traders care about
const NOT_HOLDERS = new Set(["AMM", "LOCKER", "BURN"]);

export async function fetchSolanaSecurity(mint: string): Promise<SecurityData> {
  const [report, summary] = await Promise.all([
    getJson<Report>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, 12_000),
    getJson<Summary>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`).catch(() => ({}) as Summary),
  ]);

  const known = report.knownAccounts ?? {};
  const isHolder = (h: { address: string; owner: string }) =>
    !NOT_HOLDERS.has(known[h.owner]?.type ?? "") && !NOT_HOLDERS.has(known[h.address]?.type ?? "");
  const top10 = (report.topHolders ?? []).filter(isHolder).slice(0, 10);

  const supply = report.token?.supply;
  const insiderHolding = (report.insiderNetworks ?? []).reduce((sum, n) => sum + (n.currentHolding ?? 0), 0);
  const flags = (report.risks ?? []).filter((r) => r.level === "danger").map((r) => r.name);
  if (report.rugged) flags.unshift("Flagged as rugged by RugCheck");

  return {
    source: "rugcheck",
    holders: report.totalHolders,
    top10Pct: top10.length ? top10.reduce((sum, h) => sum + h.pct, 0) : undefined,
    top5: top10.slice(0, 5).map((h) => h.pct),
    insiderWallets: report.graphInsidersDetected,
    insiderPct: supply && report.insiderNetworks ? (insiderHolding / supply) * 100 : undefined,
    creatorPct: supply && report.creatorBalance !== undefined ? (report.creatorBalance / supply) * 100 : undefined,
    lpLockedPct: summary.lpLockedPct,
    mintable: report.mintAuthority !== null,
    freezable: report.freezeAuthority !== null,
    onBondingCurve: (report.markets ?? []).some((m) => m.marketType === "pump_fun"),
    flags,
  };
}
