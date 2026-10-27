import { Bot } from "grammy";
import pino from "pino";
import { BOT_COMMANDS, registerBot } from "./bot/index.js";
import { registerScan } from "./bot/scan.js";
import { createChainClient } from "./chain/client.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import type { Deps } from "./deps.js";
import { startJobs } from "./jobs/recheck.js";
import { tierGroups } from "./tiers.js";
import { createServer } from "./web/server.js";

const config = loadConfig();
const log = pino({
  level: config.LOG_LEVEL,
  transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
});

const database = createDb(config.DATABASE_URL);
await database.migrate();

const bot = new Bot(config.BOT_TOKEN);
await bot.init();

const deps: Deps = {
  config,
  db: database.db,
  chain: createChainClient(config),
  api: bot.api,
  groups: tierGroups(config),
  log,
};
if (deps.groups.length === 0) log.warn("No TIER_*_CHAT_ID set; wallets will link but no rooms are gated");

registerBot(bot, deps);
registerScan(bot, deps);
await bot.api.setMyCommands(BOT_COMMANDS);

const server = await createServer(deps, bot.botInfo.username);
await server.listen({ port: config.PORT, host: "0.0.0.0" });

const boss = await startJobs(deps);

bot.start({
  allowed_updates: ["message", "callback_query", "chat_join_request"],
  onStart: (me) => log.info(`@${me.username} running, verify page at ${config.PUBLIC_URL}/link`),
});

async function shutdown() {
  log.info("shutting down");
  await bot.stop();
  await boss.stop();
  await server.close();
  await database.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
