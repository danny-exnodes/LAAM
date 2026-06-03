import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from .env (see .env.example). `db:generate` works without a
// live DB (emits SQL from the schema); `db:push` / `db:migrate` need Postgres up.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://laam:laam@localhost:5432/laam",
  },
  verbose: true,
  strict: true,
});
