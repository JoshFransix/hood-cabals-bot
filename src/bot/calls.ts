import { desc, eq, gt } from "drizzle-orm";
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { fmtMultiple } from "../alerts/performance.js";
import { leaderboardText, PERIODS, rankCallers, type Period } from "../calls/leaderboard.js";
import { callHeader, makeCall } from "../calls/service.js";
import { calls } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { getUser } from "../holders.js";
import { findAddress, parseAddress } from "../scan/detect.js";
import { getTradeLinks, tradeButtons } from "../scan/trade.js";
import { fmtUsd, scanCard } from "../scan/view.js";
import { tierById } from "../tiers.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function displayName(ctx: Context): string {
  const f = ctx.from!;
  return f.username ? `@${f.username}` : [f.first_name, f.last_name].filter(Boolean).join(" ").slice(0, 32);
}

function periodKeyboard(active: Period) {
  const kb = new InlineKeyboard();
  for (const p of Object.keys(PERIODS) as Period[]) kb.text(p === active ? `· ${p.toUpperCase()} ·` : p.toUpperCase(), `lb:${p}`);
  return kb;
}

export function registerCalls(bot: Bot, deps: Deps) {
  bot.command("call", async (ctx) => {
    const reply = (text: string) => ctx.reply(text, { parse_mode: "HTML", reply_parameters: { message_id: ctx.msg.message_id } });
    const user = await getUser(deps, ctx.from!.id);
    const tier = tierById(user?.tier ?? null);
    if (!tier) return reply("◈ Calls are for holders. DM me /link to verify your Hood Cabals first.");

    const target = parseAddress(ctx.match) ?? parseAddress(findAddress(ctx.match) ?? "");
    if (!target) return reply("Usage: /call &lt;token address&gt;");

    await ctx.replyWithChatAction("typing").catch(() => {});
    const result = await makeCall(deps, { id: ctx.from!.id, name: displayName(ctx), tier: tier.id }, target, ctx.chat.id, ctx.msg.message_id);
    if (!result.ok) return reply(`◈ ${escape(result.reason)}`);

    const card = scanCard(result.scan, tradeButtons(getTradeLinks(), result.scan.chain, result.scan.address, result.scan.market?.pairAddress));
    await ctx.reply(`${callHeader(result, tier.name)}\n\n${card.text}`, {
      parse_mode: "HTML",
      reply_markup: card.keyboard,
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: ctx.msg.message_id },
    });
  });

  const showBoard = async (ctx: Context, period: Period) => {
    const days = PERIODS[period];
    const list = await deps.db
      .select()
      .from(calls)
      .where(days === null ? undefined : gt(calls.createdAt, new Date(Date.now() - days * 24 * 3600_000)));
    const text = leaderboardText(rankCallers(list), period);
    const opts = { parse_mode: "HTML" as const, reply_markup: periodKeyboard(period) };
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.editMessageText(text, opts).catch(() => {});
    } else {
      await ctx.reply(text, opts);
    }
  };
  bot.command(["leaderboard", "lb"], (ctx) => showBoard(ctx, "7d"));
  bot.callbackQuery(/^lb:(7d|30d|all)$/, (ctx) => showBoard(ctx, ctx.match[1] as Period));

  bot.command("mycalls", async (ctx) => {
    const mine = await deps.db.select().from(calls).where(eq(calls.userId, ctx.from!.id)).orderBy(desc(calls.createdAt)).limit(10);
    if (!mine.length) return ctx.reply("◈ No calls yet. Use /call &lt;token address&gt; in the rooms.", { parse_mode: "HTML" });
    const scored = mine.filter((c) => c.peakMultiple !== null);
    const hits = scored.filter((c) => c.peakMultiple! >= 2).length;
    const rows = mine.map((c) => {
      const result = c.peakMultiple === null ? "PENDING" : fmtMultiple(c.peakMultiple);
      return `${`$${(c.symbol ?? "?").slice(0, 10)}`.padEnd(12)}${fmtUsd(c.marketCapUsd).padStart(9)}  ${result.padStart(7)}`;
    });
    await ctx.reply(
      [
        "◈ <b>YOUR CALLS</b> · <code>LAST 10</code>",
        "",
        `<pre>${escape(`${"TOKEN".padEnd(12)}${"CALLED AT".padStart(9)}  ${"PEAK".padStart(7)}\n${rows.join("\n")}`)}</pre>`,
        scored.length ? `${hits}/${scored.length} scored calls hit 2x.` : "Calls are scored from 1h after they're made.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });
}

