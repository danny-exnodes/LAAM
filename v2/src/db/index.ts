// Single shared Drizzle client (node-postgres pool).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://laam:laam@localhost:5432/laam";

// Reuse the pool across hot-reloads in dev (Next.js re-evaluates modules).
const globalForDb = globalThis as unknown as { _laamPool?: Pool };
const pool = globalForDb._laamPool ?? new Pool({ connectionString });
if (process.env.NODE_ENV !== "production") globalForDb._laamPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
