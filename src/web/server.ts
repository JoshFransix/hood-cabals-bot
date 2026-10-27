import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import { and, eq, gt, isNull } from "drizzle-orm";
import Fastify from "fastify";
import { z } from "zod";
import { linkRequests } from "../db/schema.js";
import type { Deps } from "../deps.js";
import { linkWallet } from "../holders.js";
import { linkMessage, verifyLinkSignature } from "../link/message.js";
import { tierById } from "../tiers.js";
import { linkedText } from "../bot/views.js";

const PUBLIC_DIR = join(process.cwd(), "public");

const linkBody = z.object({
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

type ActiveRequest =
  | { req: typeof linkRequests.$inferSelect }
  | { error: string; status: 404 | 410 };

async function activeRequest(deps: Deps, nonce: string): Promise<ActiveRequest> {
  const [req] = await deps.db.select().from(linkRequests).where(eq(linkRequests.nonce, nonce));
  if (!req) return { error: "Link not found. Request a fresh one from the bot with /link.", status: 404 }
  if (req.usedAt) return { error: "This link was already used.", status: 410 }
  if (req.expiresAt < new Date()) return { error: "This link has expired. Request a fresh one with /link.", status: 410 }
  return { req }
}

export async function createServer(deps: Deps, botUsername: string) {
  const app = Fastify({ loggerInstance: deps.log, trustProxy: true });
  await app.register(fastifyStatic, { root: PUBLIC_DIR, index: false });

  const linkPage = await readFile(join(PUBLIC_DIR, "link.html"));
  app.get("/link", (_req, reply) => reply.type("text/html").send(linkPage));
  app.get("/health", () => ({ ok: true }));

  app.get<{ Params: { nonce: string } }>("/api/link/:nonce", async (request, reply) => {
    const found = await activeRequest(deps, request.params.nonce);
    if ("error" in found) return reply.code(found.status).send({ error: found.error, botUsername });
    return { message: linkMessage(found.req.telegramId, found.req.nonce), botUsername };
  });

  app.post("/api/link", async (request, reply) => {
    const parsed = linkBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad request." });
    const { nonce, address, signature } = parsed.data;

    const found = await activeRequest(deps, nonce);
    if ("error" in found) return reply.code(found.status).send({ error: found.error });

    const message = linkMessage(found.req.telegramId, nonce);
    const valid = await verifyLinkSignature(deps.chain, address as `0x${string}`, message, signature as `0x${string}`);
    if (!valid) return reply.code(401).send({ error: "Signature didn't match this wallet." });

    // Burn the nonce atomically so a signature can't be submitted twice
    const burned = await deps.db
      .update(linkRequests)
      .set({ usedAt: new Date() })
      .where(and(eq(linkRequests.nonce, nonce), isNull(linkRequests.usedAt), gt(linkRequests.expiresAt, new Date())))
      .returning();
    if (burned.length === 0) return reply.code(410).send({ error: "This link was already used." });

    const user = await linkWallet(deps, found.req.telegramId, address as `0x${string}`);
    const tier = tierById(user?.tier ?? null);
    await deps.api
      .sendMessage(found.req.telegramId, linkedText(tier?.name ?? null, user?.nftCount ?? 0), { parse_mode: "HTML" })
      .catch(() => {});
    return { tier: tier?.name ?? null, nftCount: user?.nftCount ?? 0 };
  });

  return app;
}
