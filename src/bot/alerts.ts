import { and, eq, or } from "drizzle-orm";
import type { Bot, Context } from "grammy";
import { submitSignal } from "../alerts/pipeline.js";
import { trackedWallets, users } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { getUser } from "../holders.js";
import { findAddress, parseAddress } from "../scan/detect.js";
import { tierById } from "../tiers.js";
import { syncHeliusWebhook } from "../wallets/helius.js";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function registerAlerts(bot: Bot, deps: Deps) {
  const isAdmin = (ctx: Context) => ctx.from !== undefined && deps.config.ADMIN_IDS.includes(ctx.from.id);

  // Relay intake: any CA posted in the intake chat becomes a signal. Registered first so it
  // runs before other handlers; it only ever looks at the intake chat.
  bot.on(["message", "channel_post"], async (ctx, next) => {
    if (deps.config.INTAKE_CHAT_ID === undefined || ctx.chat.id !== deps.config.INTAKE_CHAT_ID) return next();
    const msg = ctx.msg!;
    if (deps.config.INTAKE_FROM_ID !== undefined && msg.from?.id !== deps.config.INTAKE_FROM_ID) return next();
    const address = findAddress(msg.text ?? msg.caption ?? "");
    if (!address) return next();
    void submitSignal(deps, { address, source: "intake" }).catch((err) =>
      deps.log.error({ err, address }, "intake signal failed"),
    );
  });

  bot.command("myid", (ctx) => ctx.reply(`Your Telegram id: <code>${ctx.from?.id}</code>`, { parse_mode: "HTML" }));

  bot.chatType("private").command("alerts", async (ctx) => {
    const user = await getUser(deps, ctx.from.id);
    const tier = tierById(user?.tier ?? null);
    if (!user || !tier) {
      return ctx.reply("◈ Alerts are for holders. Link a wallet with a Hood Cabal first: /link");
    }
    const on = !user.alertsDm;
    await deps.db.update(users).set({ alertsDm: on }).where(eq(users.telegramId, ctx.from.id));
    const timing =
      tier.id === "inner"
        ? "the moment they fire"
        : `${tier.id === "cabal" ? deps.config.ALERT_DELAY_CABAL_MIN : deps.config.ALERT_DELAY_HOOD_MIN} min after Inner Circle`;
    await ctx.reply(
      on
        ? `◈ <b>ALERTS ON</b>\n<code>TIER / ${tier.name.toUpperCase()}</code>\n\nYou'll get alerts here ${timing}. Send /alerts again to turn them off.`
        : "◈ <b>ALERTS OFF</b>\n\nYou'll still see them in your rooms. Send /alerts to turn DMs back on.",
      { parse_mode: "HTML" },
    );
  });

  bot.command("track", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const [raw, ...labelParts] = ctx.match.trim().split(/\s+/);
    const parsed = parseAddress(raw ?? "");
    if (!parsed || parsed.kind !== "base58") {
      return ctx.reply("Usage: /track <solana wallet> [label]\nOnly Solana wallets for now.");
    }
    const label = (labelParts.join(" ") || `CABAL-${parsed.address.slice(0, 4)}`).slice(0, 24);
    await deps.db
      .insert(trackedWallets)
      .values({ chain: "solana", address: parsed.address, label, addedBy: ctx.from!.id })
      .onConflictDoUpdate({ target: [trackedWallets.chain, trackedWallets.address], set: { label } });
    const status = await syncHeliusWebhook(deps).catch((err) => `Saved, but Helius sync failed: ${err.message}`);
    await ctx.reply(`◈ Tracking <b>${escape(label)}</b>\n<code>${parsed.address}</code>\n\n${escape(status)}`, { parse_mode: "HTML" });
  });

  bot.command("untrack", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const key = ctx.match.trim();
    if (!key) return ctx.reply("Usage: /untrack <wallet or label>");
    const removed = await deps.db
      .delete(trackedWallets)
      .where(or(eq(trackedWallets.address, key), eq(trackedWallets.label, key)))
      .returning({ label: trackedWallets.label });
    if (!removed.length) return ctx.reply("No tracked wallet matches that.");
    const status = await syncHeliusWebhook(deps).catch((err) => `Removed, but Helius sync failed: ${err.message}`);
    await ctx.reply(`◈ Stopped tracking ${escape(removed.map((r) => r.label).join(", "))}.\n${escape(status)}`, { parse_mode: "HTML" });
  });

  bot.command("wallets", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const list = await deps.db.select().from(trackedWallets).where(and(eq(trackedWallets.chain, "solana")));
    if (!list.length) return ctx.reply("No wallets tracked. Add one with /track <wallet> [label].");
    const lines = list.map((w) => `<b>${escape(w.label)}</b>\n<code>${w.address}</code>`);
    await ctx.reply(`◈ <b>TRACKED WALLETS</b> · ${list.length}\n\n${lines.join("\n\n")}`, { parse_mode: "HTML" });
  });
}
