import { and, eq, ne } from "drizzle-orm";
import type { Address } from "viem";
import { tierChangeText } from "./bot/views.js";
import { nftBalance } from "./chain/client.js";
import { users, type User } from "./db/schema.js";
import type { Deps } from "./deps.js";
import { canAccess, tierById, tierFor, tierTag, type Tier, type TierGroup, type TierId } from "./tiers.js";

const inviteLinks = new Map<number, string>();

/** One join-request link per group; the bot approves or declines each request. */
export async function inviteLink(deps: Deps, group: TierGroup): Promise<string> {
  const cached = inviteLinks.get(group.chatId);
  if (cached) return cached;
  const link = await deps.api.createChatInviteLink(group.chatId, {
    name: "Hood Cabals bot",
    creates_join_request: true,
  });
  inviteLinks.set(group.chatId, link.invite_link);
  return link.invite_link;
}

export function allowedGroups(deps: Deps, tier: string | null): TierGroup[] {
  const id = tierById(tier)?.id ?? null;
  return deps.groups.filter((g) => canAccess(id, g.tier.id));
}

/** Removes the user from groups their old tier allowed but the new one doesn't. */
async function revokeAccess(deps: Deps, telegramId: number, from: TierId | null, to: TierId | null) {
  for (const group of deps.groups) {
    if (!canAccess(from, group.tier.id) || canAccess(to, group.tier.id)) continue;
    try {
      // Ban then unban is Telegram's way of kicking without a permanent ban
      await deps.api.banChatMember(group.chatId, telegramId);
      await deps.api.unbanChatMember(group.chatId, telegramId, { only_if_banned: true });
    } catch (err) {
      deps.log.debug({ err, telegramId, chatId: group.chatId }, "kick skipped");
    }
  }
}

/** Shows the member's tier next to their name in every room they can be in, plus the community group. */
export async function syncTags(deps: Deps, telegramId: number, tier: Tier | null) {
  const chats = [
    ...allowedGroups(deps, tier?.id ?? null).map((g) => g.chatId),
    ...(deps.config.COMMUNITY_CHAT_ID !== undefined ? [deps.config.COMMUNITY_CHAT_ID] : []),
  ];
  for (const chatId of chats) {
    // Fails harmlessly when the member hasn't joined that chat
    await deps.api.setChatMemberTag(chatId, telegramId, tierTag(tier)).catch((err) => {
      deps.log.debug({ err, telegramId, chatId }, "tag skipped");
    });
  }
}

export async function getUser(deps: Deps, telegramId: number): Promise<User | undefined> {
  const [user] = await deps.db.select().from(users).where(eq(users.telegramId, telegramId));
  return user;
}

export async function touchUser(deps: Deps, telegramId: number, username: string | undefined) {
  // null, not undefined: Drizzle drops undefined fields and then has nothing to update
  const name = username ?? null;
  await deps.db
    .insert(users)
    .values({ telegramId, username: name })
    .onConflictDoUpdate({ target: users.telegramId, set: { username: name } });
}

/** Re-reads the wallet's NFT balance, updates the tier and removes access that no longer applies. */
export async function refreshHolder(
  deps: Deps,
  telegramId: number,
  opts: { notify: boolean; syncTags?: boolean },
): Promise<User | undefined> {
  const user = await getUser(deps, telegramId);
  if (!user?.wallet) return user;

  const nftCount = await nftBalance(deps.chain, deps.config.NFT_CONTRACT as Address, user.wallet as Address);
  const tier = tierFor(nftCount);
  const oldTier = tierById(user.tier);

  const [updated] = await deps.db
    .update(users)
    .set({ nftCount, tier: tier?.id ?? null, checkedAt: new Date() })
    .where(eq(users.telegramId, telegramId))
    .returning();

  if (oldTier?.id !== tier?.id) {
    await revokeAccess(deps, telegramId, oldTier?.id ?? null, tier?.id ?? null);
    if (opts.notify) {
      const text = tierChangeText(oldTier?.name ?? null, tier?.name ?? null, nftCount);
      await deps.api.sendMessage(telegramId, text, { parse_mode: "HTML" }).catch(() => {});
    }
  }
  if (oldTier?.id !== tier?.id || opts.syncTags) await syncTags(deps, telegramId, tier);
  return updated;
}

/** Attaches a wallet to a Telegram account. A wallet can only back one account at a time. */
export async function linkWallet(deps: Deps, telegramId: number, wallet: Address): Promise<User | undefined> {
  const address = wallet.toLowerCase();

  const previous = await deps.db
    .update(users)
    .set({ wallet: null, nftCount: 0, tier: null })
    .where(and(eq(users.wallet, address), ne(users.telegramId, telegramId)))
    .returning({ telegramId: users.telegramId, tier: users.tier });
  for (const p of previous) {
    await revokeAccess(deps, p.telegramId, tierById(p.tier)?.id ?? null, null);
    await syncTags(deps, p.telegramId, null);
    await deps.api
      .sendMessage(p.telegramId, "◈ Your wallet was linked to another Telegram account, so your access here was removed.")
      .catch(() => {});
  }

  await deps.db
    .insert(users)
    .values({ telegramId, wallet: address, linkedAt: new Date() })
    .onConflictDoUpdate({ target: users.telegramId, set: { wallet: address, linkedAt: new Date() } });

  return refreshHolder(deps, telegramId, { notify: false });
}
