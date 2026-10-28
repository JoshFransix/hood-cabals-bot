import { Bot, GrammyError, InlineKeyboard, type Context } from "grammy";
import { linkRequests } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { allowedGroups, getUser, inviteLink, refreshHolder, touchUser } from "../holders.js";
import { LINK_TTL_MS, newNonce } from "../link/message.js";
import { canAccess, tierById, tierTag } from "../tiers.js";
import { HELP_TEXT, homeView, linkView, statusView } from "./views.js";

const REFRESH_COOLDOWN_MS = 60_000;

/** Edits the menu in place when a button was pressed, otherwise sends a new message. */
async function render(ctx: Context, text: string, keyboard: InlineKeyboard) {
  const opts = { parse_mode: "HTML" as const, reply_markup: keyboard, link_preview_options: { is_disabled: true } };
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
    try {
      await ctx.editMessageText(text, opts);
      return;
    } catch (err) {
      if (err instanceof GrammyError && err.description.includes("message is not modified")) return;
      throw err;
    }
  }
  await ctx.reply(text, opts);
}

export function registerBot(bot: Bot, deps: Deps) {
  const pm = bot.chatType("private");

  pm.use(async (ctx, next) => {
    await touchUser(deps, ctx.from.id, ctx.from.username);
    await next();
  });

  const showHome = (ctx: Context) => {
    const v = homeView();
    return render(ctx, v.text, v.keyboard);
  };

  const showHelp = (ctx: Context) => render(ctx, HELP_TEXT, new InlineKeyboard().text("‹ Back", "home"));

  const showStatus = async (ctx: Context) => {
    const user = await getUser(deps, ctx.from!.id);
    const links = [];
    for (const group of allowedGroups(deps, user?.tier ?? null)) {
      links.push({ name: group.tier.name, url: await inviteLink(deps, group) });
    }
    const v = statusView(user, links);
    return render(ctx, v.text, v.keyboard);
  };

  const startLink = async (ctx: Context) => {
    const nonce = newNonce();
    await deps.db.insert(linkRequests).values({
      nonce,
      telegramId: ctx.from!.id,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    });
    const url = `${deps.config.PUBLIC_URL}/link?n=${nonce}`;
    const v = linkView(url, url.startsWith("https://"));
    return render(ctx, v.text, v.keyboard);
  };

  const refresh = async (ctx: Context) => {
    const user = await getUser(deps, ctx.from!.id);
    if (!user?.wallet) return startLink(ctx);
    if (user.checkedAt && Date.now() - user.checkedAt.getTime() < REFRESH_COOLDOWN_MS) {
      await ctx.answerCallbackQuery({ text: "Checked under a minute ago. Give it a moment." }).catch(() => {});
      return showStatus(ctx);
    }
    await refreshHolder(deps, user.telegramId, { notify: false });
    return showStatus(ctx);
  };

  pm.command("start", showHome);
  pm.command("link", startLink);
  pm.command("status", showStatus);
  pm.command("help", showHelp);

  pm.callbackQuery("home", showHome);
  pm.callbackQuery("status", showStatus);
  pm.callbackQuery("link", startLink);
  pm.callbackQuery("refresh", refresh);
  pm.callbackQuery("help", showHelp);

  // Setup helper: run /chatid inside a tier group to get the ID for .env
  bot.chatType(["group", "supergroup"]).command("chatid", (ctx) =>
    ctx.reply(`<code>${ctx.chat.id}</code>`, { parse_mode: "HTML" }),
  );

  bot.on("chat_join_request", async (ctx) => {
    const { chat, from } = ctx.chatJoinRequest;
    const group = deps.groups.find((g) => g.chatId === chat.id);
    if (!group) return;
    const user = await getUser(deps, from.id);
    const tier = tierById(user?.tier ?? null);
    if (canAccess(tier?.id ?? null, group.tier.id)) {
      await ctx.approveChatJoinRequest(from.id);
      await ctx.api.setChatMemberTag(chat.id, from.id, tierTag(tier)).catch(() => {});
      deps.log.info({ user: from.id, group: group.tier.id }, "join approved");
    } else {
      await ctx.declineChatJoinRequest(from.id);
      await ctx.api
        .sendMessage(
          from.id,
          `◈ The ${group.tier.name} room needs ${group.tier.minNfts}+ Hood Cabals. Check /status.`,
        )
        .catch(() => {});
    }
  });

  bot.catch((err) => deps.log.error({ err: err.error, update: err.ctx.update.update_id }, "bot error"));
}

export const BOT_COMMANDS = [
  { command: "start", description: "Main menu" },
  { command: "link", description: "Link your wallet" },
  { command: "status", description: "Your tier and rooms" },
  { command: "scan", description: "Risk-check a token address" },
  { command: "help", description: "How it works" },
];
