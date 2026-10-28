import { InlineKeyboard } from "grammy";
import type { User } from "../db/schema.js";
import { TIERS, tierById } from "../tiers.js";

// Telegram can't do colour or fonts, so the brand comes through in voice,
// the ◈ glyph from the site, and monospace blocks standing in for DM Mono labels.

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function table(rows: [string, string][]): string {
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  return `<pre>${rows.map(([k, v]) => k.padEnd(width, " ") + v).join("\n")}</pre>`;
}

export function homeView() {
  const text = [
    "◈ <b>HOOD CABALS</b>",
    "<code>HOLDER ACCESS / OPEN</code>",
    "",
    "The cabal only talks to its own. Link the wallet holding your Hood Cabals and the doors open.",
    "",
    table(TIERS.map((t) => [t.name.toUpperCase(), `${t.minNfts}+ HELD`])),
  ].join("\n");
  const keyboard = new InlineKeyboard()
    .text("◈ Link wallet", "link")
    .text("Status", "status")
    .row()
    .text("Refresh ↻", "refresh")
    .text("Help", "help")
    .row()
    .text("◈ Scan a token", "scan-help");
  return { text, keyboard };
}

export function statusView(user: User | undefined, groupLinks: { name: string; url: string }[]) {
  if (!user?.wallet) {
    return {
      text: "◈ <b>STATUS</b>\n<code>NO WALLET LINKED</code>\n\nYou're not on record yet. Link a wallet to get your tier.",
      keyboard: new InlineKeyboard().text("◈ Link wallet", "link").row().text("‹ Back", "home"),
    };
  }
  const tier = tierById(user.tier);
  const checked = user.checkedAt ? user.checkedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "NEVER";
  const text = [
    "◈ <b>STATUS</b>",
    `<code>WALLET ${shortAddress(user.wallet)}</code>`,
    "",
    table([
      ["HELD", String(user.nftCount)],
      ["TIER", tier?.name.toUpperCase() ?? "NONE"],
      ["CHECKED", checked],
    ]),
    groupLinks.length
      ? "Your doors are below. Each one asks to join and the bot lets you in."
      : "No Hood Cabals in this wallet. Hold one to get through the first door.",
  ].join("\n");
  const keyboard = new InlineKeyboard();
  for (const g of groupLinks) keyboard.url(`Enter ${g.name} ↗`, g.url).row();
  keyboard.text("Refresh ↻", "refresh").text("‹ Back", "home");
  return { text, keyboard };
}

export function linkView(url: string, isHttps: boolean) {
  const lines = [
    "◈ <b>VERIFY</b>",
    "<code>01 CONNECT / 02 SIGN / 03 ENTER</code>",
    "",
    "Open the page, connect the wallet holding your Hood Cabals and sign one message. No gas, no transaction.",
    "",
    "The link burns in 15 minutes.",
  ];
  const keyboard = new InlineKeyboard();
  if (isHttps) {
    const dapp = url.replace(/^https:\/\//, "");
    keyboard.url("Open verify page ↗", url).row().url("Open in MetaMask ↗", `https://metamask.app.link/dapp/${dapp}`).row();
  } else {
    // Telegram won't make localhost clickable or put it in a button, so local
    // testing gets it as tap-to-copy text
    lines.push("", "Tap to copy, then paste into your browser:", `<code>${url}</code>`);
  }
  keyboard.text("‹ Back", "home");
  return { text: lines.join("\n"), keyboard };
}

export const HELP_TEXT = [
  "◈ <b>HOW IT WORKS</b>",
  "",
  "<code>01</code> Tap Link wallet and sign with the wallet holding your Hood Cabals.",
  "<code>02</code> Your tier is set by how many you hold. Each tier opens its own room and every room below it.",
  "<code>03</code> Holdings are checked daily. Drop below a tier and you're out of that room.",
  "<code>04</code> Paste any token address here, or use /scan in the rooms, for a risk check.",
  "<code>05</code> Alerts land in your room. Inner Circle gets them first, then Cabal, then Hood. Send /alerts to also get them by DM.",
  "",
  "One wallet, one Telegram account.",
].join("\n");

export function tierChangeText(from: string | null, to: string | null, held: number): string {
  if (!to) return "◈ <b>ACCESS REVOKED</b>\n\nNo Hood Cabals left in your wallet, so the doors are closed. Pick one up and refresh to get back in.";
  return `◈ <b>TIER UPDATE</b>\n<code>${(from ?? "NONE").toUpperCase()} → ${to.toUpperCase()}</code>\n\n${held} held.`;
}

export function linkedText(tier: string | null, held: number): string {
  if (!tier) return "◈ <b>WALLET LINKED</b>\n\nNo Hood Cabals in this wallet yet. Pick one up and tap Refresh in /status.";
  return `◈ <b>WALLET LINKED</b>\n<code>TIER / ${tier.toUpperCase()}</code>\n\n${held} held. Tap /status for your rooms.`;
}
