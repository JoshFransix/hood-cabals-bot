import type { Api } from "grammy";
import type { Logger } from "pino";
import type { ChainClient } from "./chain/client.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { TierGroup } from "./tiers.js";

export interface Deps {
  config: Config;
  db: Db;
  chain: ChainClient;
  api: Api;
  groups: TierGroup[];
  log: Logger;
}
