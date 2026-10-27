import type { MarketData, Risk, SecurityData } from "./types.js";

// Points per finding. 0-1 is LOW, 2-4 MEDIUM, 5+ HIGH. A honeypot alone is HIGH.
export function assessRisk(market: MarketData | null, security: SecurityData | null, now = new Date()): Risk {
  if (!market && !security) return { level: "UNKNOWN", score: 0, reasons: ["No market or security data found"] };

  const found: [number, string][] = [];
  const add = (points: number, reason: string) => found.push([points, reason]);

  if (security) {
    const s = security;
    if (s.honeypot) add(10, "Honeypot: sells are blocked");
    if (s.mintable) add(3, "Dev can still mint more supply");
    if (s.freezable) add(3, "Dev can freeze wallets");
    if (s.pausable) add(3, "Transfers can be paused");
    if (s.hiddenOwner) add(3, "Hidden owner");
    if (s.sellTaxPct !== undefined && s.sellTaxPct > 10) add(3, `Sell tax ${fmtPct(s.sellTaxPct)}`);
    else if ((s.sellTaxPct ?? 0) > 5 || (s.buyTaxPct ?? 0) > 5) add(1, `Tax ${fmtPct(s.buyTaxPct ?? 0)} / ${fmtPct(s.sellTaxPct ?? 0)}`);
    if (s.top10Pct !== undefined && s.top10Pct > 50) add(2, `Top 10 hold ${fmtPct(s.top10Pct)}`);
    else if (s.top10Pct !== undefined && s.top10Pct > 30) add(1, `Top 10 hold ${fmtPct(s.top10Pct)}`);
    if (s.holders !== undefined && s.holders < 50) add(1, `Only ${s.holders} holders`);
    if (s.insiderPct !== undefined && s.insiderPct > 20) add(2, `Insider networks hold ${fmtPct(s.insiderPct)}`);
    else if (s.insiderPct !== undefined && s.insiderPct > 10) add(1, `Insider networks hold ${fmtPct(s.insiderPct)}`);
    if (s.creatorPct !== undefined && s.creatorPct > 10) add(2, `Dev holds ${fmtPct(s.creatorPct)}`);
    if (s.lpPositions) {
      // v3/v4 liquidity can't be burned like LP tokens; what matters is whether one wallet can pull most of it
      if (s.lpTopHolderPct !== undefined && s.lpTopHolderPct > 50) add(2, `One wallet controls ${fmtPct(s.lpTopHolderPct)} of liquidity`);
      else if (s.lpLockedPct !== undefined && s.lpLockedPct < 50) add(1, "Liquidity positions aren't locked");
    } else if (s.lpLockedPct !== undefined && s.lpLockedPct < 50 && !s.onBondingCurve) {
      add(2, `Only ${fmtPct(s.lpLockedPct)} of LP locked or burned`);
    }
    if (s.ownerRenounced === false) add(1, "Contract ownership not renounced");
  }

  if (market) {
    const liq = market.liquidityUsd;
    if (liq !== undefined && liq < 5_000) add(3, `Liquidity under $5K`);
    else if (liq !== undefined && liq < 20_000) add(1, `Liquidity under $20K`);
    if (market.pairCreatedAt && now.getTime() - market.pairCreatedAt.getTime() < 3_600_000) add(1, "Pair is under 1 hour old");
  } else if (security?.onBondingCurve) {
    add(1, "Still on the pump.fun bonding curve");
  } else {
    add(2, "No trading pair found");
  }

  const score = found.reduce((sum, [p]) => sum + p, 0);
  const reasons = found.sort((a, b) => b[0] - a[0]).map(([, r]) => r);
  const level = score >= 5 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";
  // Market data alone can't clear a token: without the security check, LOW becomes UNKNOWN
  if (!security && level === "LOW") return { level: "UNKNOWN", score, reasons: [...reasons, "Security check unavailable"] };
  return { level, score, reasons };
}

function fmtPct(n: number): string {
  return `${n >= 10 ? Math.round(n) : Number(n.toFixed(1))}%`;
}
