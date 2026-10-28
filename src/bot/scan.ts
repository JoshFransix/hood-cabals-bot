import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Deps } from "../deps.js";
import { getUser } from "../holders.js";
import { findAddress, parseAddress } from "../scan/detect.js";
import { RateLimiter } from "../scan/limit.js";
import { recordScan, scanToken, type ScanRequest } from "../scan/service.js";
import { getTradeLinks, tradeButtons } from "../scan/trade.js";
import { SCAN_HELP, scanCard } from "../scan/view.js";

// Holders get more scans; everyone else can still try it
const HOLDER_PER_MIN = 10;
const PUBLIC_PER_MIN = 3;

export function registerScan(bot: Bot, deps: Deps) {
  const limiter = new RateLimiter();
  const tradeLinks = getTradeLinks();

  async function runScan(ctx: Context, req: ScanRequest, fresh: boolean) {
    const userId = ctx.from!.id;
    const user = await getUser(deps, userId);
    const wait = limiter.take(userId, user?.tier ? HOLDER_PER_MIN : PUBLIC_PER_MIN);
    if (wait) {
      const text = user?.tier
        ? `Slow down, try again in ${wait}s.`
        : `Scan limit reached, try again in ${wait}s. Holders get more scans: /link`;
      if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text });
      return ctx.reply(text, { reply_parameters: ctx.msg ? { message_id: ctx.msg.message_id } : undefined });
    }

    await ctx.replyWithChatAction("typing").catch(() => {});
    const scan = await scanToken(deps, req, { fresh });
    if (!scan) {
      const text = "◈ Couldn't find this token on any DEX yet. If it just launched, try again in a minute.";
      if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text });
      return ctx.reply(text, { reply_parameters: { message_id: ctx.msg!.message_id } });
    }
    void recordScan(deps, scan, userId, ctx.chat!.id);
    const card = scanCard(scan, tradeButtons(tradeLinks, scan.chain, scan.address, scan.market?.pairAddress));
    const opts = { parse_mode: "HTML" as const, reply_markup: card.keyboard, link_preview_options: { is_disabled: true } };

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.editMessageText(card.text, opts).catch(() => {});
      return;
    }
    await ctx.reply(card.text, { ...opts, reply_parameters: { message_id: ctx.msg!.message_id } });
  }

  bot.command("scan", async (ctx) => {
    const target = parseAddress(ctx.match) ?? parseAddress(findAddress(ctx.match) ?? "");
    if (!target) {
      if (ctx.chat.type === "private") return ctx.reply(SCAN_HELP, { parse_mode: "HTML" });
      return ctx.reply("Usage: /scan <token address>", { reply_parameters: { message_id: ctx.msg.message_id } });
    }
    await runScan(ctx, target, false);
  });

  bot.callbackQuery(/^rescan:([a-z0-9]+):(\S+)$/, async (ctx) => {
    const [, chain, raw] = ctx.match;
    const target = parseAddress(raw!);
    if (!target) return ctx.answerCallbackQuery();
    await runScan(ctx, { ...target, chain }, true);
  });

  bot.callbackQuery("scan-help", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText(SCAN_HELP, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("‹ Back", "home"),
    });
  });

  // In DMs, a message that is just an address gets scanned without a command
  bot.chatType("private").on("message:text", async (ctx, next) => {
    const target = parseAddress(ctx.msg.text);
    if (!target) return next();
    await runScan(ctx, target, false);
  });
}
