import { InlineKeyboard } from "grammy";
import type { FullScan } from "./service.js";
import type { RiskLevel } from "./types.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fmtUsd(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs === 0) return "$0";
  return `$${n.toPrecision(4)}`.replace(/e-(\d+)$/, (_, e) => `e-${e}`);
}

function fmtPrice(n: number | undefined): string {
  if (n === undefined) return "—";
  // Avoid scientific notation for micro-cap prices
  return n >= 0.0001 ? fmtUsd(n) : `$${n.toFixed(12).replace(/0+$/, "")}`;
}

function fmtPct(n: number | undefined, signed = false): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const v = Math.abs(n) >= 10 ? Math.round(n) : Number(n.toFixed(1));
  return `${signed && v > 0 ? "+" : ""}${v}%`;
}

export function fmtAge(from: Date | undefined, now = new Date()): string {
  if (!from) return "—";
  const mins = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const yesNo = (v: boolean | undefined, yes: string, no: string) => (v === undefined ? "—" : v ? `${yes} ⚠` : no);

const RISK_BADGE: Record<RiskLevel, string> = { LOW: "🟢", MEDIUM: "🟡", HIGH: "🔴", UNKNOWN: "⚪" };

function table(rows: [string, string][]): string {
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  return `<pre>${rows.map(([k, v]) => escape(k.padEnd(width, " ") + v)).join("\n")}</pre>`;
}

export function scanCard(scan: FullScan) {
  const { market: m, security: s, risk } = scan;
  const symbol = m?.symbol ? `$${escape(m.symbol)}` : "UNKNOWN";
  const chainLabel = scan.chain === "solana" ? "SOLANA" : "ROBINHOOD CHAIN";

  const rows: [string, string][] = [
    ["PRICE", fmtPrice(m?.priceUsd)],
    ["MCAP", fmtUsd(m?.marketCapUsd)],
    ["LIQUIDITY", fmtUsd(m?.liquidityUsd)],
    ["VOL 24H", fmtUsd(m?.volume24hUsd)],
    ["24H", fmtPct(m?.priceChange24hPct, true)],
    ["AGE", fmtAge(m?.pairCreatedAt)],
    ["HOLDERS", s?.holders !== undefined ? s.holders.toLocaleString("en-US") : "—"],
    ["TOP 10", fmtPct(s?.top10Pct)],
  ];
  if (scan.chain === "solana") {
    rows.push(["MINT", yesNo(s?.mintable, "ACTIVE", "REVOKED")], ["FREEZE", yesNo(s?.freezable, "ACTIVE", "REVOKED")]);
  } else {
    rows.push(
      ["HONEYPOT", yesNo(s?.honeypot, "YES", "NO")],
      ["TAX B/S", s?.buyTaxPct !== undefined || s?.sellTaxPct !== undefined ? `${fmtPct(s?.buyTaxPct ?? 0)} / ${fmtPct(s?.sellTaxPct ?? 0)}` : "—"],
      ["MINT", yesNo(s?.mintable, "YES", "NO")],
      ["OWNER", s?.ownerRenounced === undefined ? "—" : s.ownerRenounced ? "RENOUNCED" : "ACTIVE ⚠"],
    );
  }
  if (s?.onBondingCurve) rows.push(["MARKET", "PUMP.FUN CURVE"]);
  else if (s?.lpPositions) rows.push(["LP TOP", s.lpTopHolderPct !== undefined ? `${fmtPct(s.lpTopHolderPct)} ONE WALLET` : "—"]);
  else rows.push(["LP LOCKED", fmtPct(s?.lpLockedPct)]);
  rows.push(["DEV HOLDS", fmtPct(s?.creatorPct)]);

  const reasons = [...risk.reasons, ...(s?.flags ?? [])].slice(0, 6);
  const sources = [m && "DEXScreener", s && (s.source === "rugcheck" ? "RugCheck" : "GoPlus")].filter(Boolean).join(", ");

  const lines = [
    `◈ <b>SCAN / ${symbol}</b>${m?.name ? ` · ${escape(m.name)}` : ""}`,
    `<code>${scan.address}</code>`,
    `<code>${chainLabel}</code>`,
    "",
    table(rows),
    `${RISK_BADGE[risk.level]} <b>RISK / ${risk.level}</b>`,
    ...reasons.map((r) => `· ${escape(r)}`),
  ];
  if (scan.missing.length) lines.push("", `<i>Couldn't load ${scan.missing.join(" or ")}. Try Rescan.</i>`);
  lines.push("", `<i>Not financial advice.${sources ? ` Data: ${sources}.` : ""}</i>`);

  const keyboard = new InlineKeyboard();
  if (m?.url) keyboard.url("Chart ↗", m.url);
  keyboard.text("Rescan ↻", `rescan:${scan.chain}:${scan.address}`);
  return { text: lines.join("\n"), keyboard };
}

export const SCAN_HELP = [
  "◈ <b>SCAN</b>",
  "<code>SOLANA / ROBINHOOD CHAIN</code>",
  "",
  "Paste a token address here, or use <code>/scan &lt;address&gt;</code> in any of the rooms.",
  "",
  "You get liquidity, market cap, holder concentration, mint and freeze status, taxes, LP lock and a risk call.",
].join("\n");
