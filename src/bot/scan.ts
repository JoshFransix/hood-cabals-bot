import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Deps } from "../deps.js";
import { getUser } from "../holders.js";
import { detectChain, findAddress } from "../scan/detect.js";
import { RateLimiter } from "../scan/limit.js";
import { recordScan, scanToken } from "../scan/service.js";
import type { ScanChain } from "../scan/types.js";
import { loadTradeLinks, tradeButtons } from "../scan/trade.js";
import { SCAN_HELP, scanCard } from "../scan/view.js";

// Holders get more scans; everyone else can still try it
const HOLDER_PER_MIN = 10;
const PUBLIC_PER_MIN = 3;

export function registerScan(bot: Bot, deps: Deps) {
  const limiter = new RateLimiter();
  const tradeLinks = loadTradeLinks();

  async function runScan(ctx: Context, chain: ScanChain, address: string, fresh: boolean) {
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
    const scan = await scanToken(deps, chain, address, { fresh });
    void recordScan(deps, scan, userId, ctx.chat!.id);
    const card = scanCard(scan, tradeButtons(tradeLinks, chain, address));
    const opts = { parse_mode: "HTML" as const, reply_markup: card.keyboard, link_preview_options: { is_disabled: true } };

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.editMessageText(card.text, opts).catch(() => {});
      return;
    }
    await ctx.reply(card.text, { ...opts, reply_parameters: { message_id: ctx.msg!.message_id } });
  }

  bot.command("scan", async (ctx) => {
    const target = detectChain(ctx.match) ?? detectChain(findAddress(ctx.match) ?? "");
    if (!target) {
      if (ctx.chat.type === "private") return ctx.reply(SCAN_HELP, { parse_mode: "HTML" });
      return ctx.reply("Usage: /scan <token address>", { reply_parameters: { message_id: ctx.msg.message_id } });
    }
    await runScan(ctx, target.chain, target.address, false);
  });

  bot.callbackQuery(/^rescan:(solana|robinhood):(\w+)$/, async (ctx) => {
    const [, chain, address] = ctx.match;
    await runScan(ctx, chain as ScanChain, address!, true);
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
    const target = detectChain(ctx.msg.text);
    if (!target) return next();
    await runScan(ctx, target.chain, target.address, false);
  });
}
