import { PgBoss } from "pg-boss";
import { deliverWave } from "../alerts/deliver.js";
import { checkAlert, weeklyRecap } from "../alerts/performance.js";
import type { WaveTier } from "../alerts/pipeline.js";
import type { Deps } from "../deps.js";
import { recheckAll } from "./recheck.js";

/**
 * pg-boss keeps jobs in Postgres, so there's no Redis to run, and scheduled alert waves
 * and checkpoints survive a restart.
 */
export async function startJobs(deps: Deps) {
  const boss = new PgBoss(deps.config.DATABASE_URL);
  boss.on("error", (err) => deps.log.error({ err }, "pg-boss error"));
  await boss.start();

  for (const name of ["recheck-holders", "alert-wave", "alert-check", "weekly-recap"]) await boss.createQueue(name);
  await boss.schedule("recheck-holders", deps.config.RECHECK_CRON, null, { tz: "UTC" });
  await boss.schedule("weekly-recap", deps.config.RECAP_CRON, null, { tz: "UTC" });

  await boss.work("recheck-holders", async () => recheckAll(deps));
  await boss.work("weekly-recap", async () => weeklyRecap(deps));
  await boss.work<{ alertId: number; tier: WaveTier }>("alert-wave", async (jobs) => {
    for (const job of jobs) await deliverWave(deps, job.data.alertId, job.data.tier);
  });
  await boss.work<{ alertId: number; hours: 1 | 6 | 24 }>("alert-check", async (jobs) => {
    for (const job of jobs) await checkAlert(deps, job.data.alertId, job.data.hours);
  });

  deps.jobs = { send: (name, data, options) => boss.send(name, data, options) };
  return boss;
}
