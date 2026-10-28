import { z } from "zod";

const chatId = z
  .string()
  .regex(/^-?\d+$/, "must be a numeric Telegram chat id")
  .transform(Number);

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url(),
  PUBLIC_URL: z.string().url().transform((u) => u.replace(/\/$/, "")),
  PORT: z.coerce.number().int().default(3000),
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().int(),
  NFT_CONTRACT: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  TIER_HOOD_CHAT_ID: chatId.optional(),
  TIER_CABAL_CHAT_ID: chatId.optional(),
  TIER_INNER_CHAT_ID: chatId.optional(),
  // Optional open group: not gated, but verified holders get their tier tag there
  COMMUNITY_CHAT_ID: chatId.optional(),
  RECHECK_CRON: z.string().default("17 4 * * *"),
  LOG_LEVEL: z.string().default("info"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(
    // Treat empty strings in .env as unset
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")),
  );
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
