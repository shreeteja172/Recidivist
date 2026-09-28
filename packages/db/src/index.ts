import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export * from "./schema";
export { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";

export type Db = NodePgDatabase<typeof schema>;

let instance: { db: Db; pool: pg.Pool } | undefined;

function connect() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    instance = { db: drizzle(pool, { schema }), pool };
  }
  return instance;
}

/** Lazily connected Drizzle client, so importing this package never needs env vars. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = connect().db;
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeDb() {
  await instance?.pool.end();
  instance = undefined;
}
