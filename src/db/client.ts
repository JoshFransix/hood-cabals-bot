import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(url: string) {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: "drizzle" }),
    close: () => sql.end(),
  };
}

export type Db = ReturnType<typeof createDb>["db"];
