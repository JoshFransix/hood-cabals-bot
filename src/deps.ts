import type { Api } from "grammy";
import type { Logger } from "pino";
import type { ChainClient } from "./chain/client.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { TierGroup } from "./tiers.js";

/** The slice of pg-boss the app uses, so handlers can schedule work without importing it. */
export interface Jobs {
  send(name: string, data: object, options?: { startAfter?: number; singletonKey?: string }): Promise<string | null>;
}

export interface Deps {
  config: Config;
  db: Db;
  chain: ChainClient;
  api: Api;
  groups: TierGroup[];
  log: Logger;
  /** Set once the job queue has started */
  jobs?: Jobs;
}
