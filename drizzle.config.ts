import { defineConfig } from "drizzle-kit";

// Migrations run STAGING-FIRST, always (BUILD_PHASES rule 5).
// Values come from .env.local — never committed (CLAUDE.md §1).
// drizzle-kit needs the SESSION pooler (port 5432): the transaction
// pooler (6543, used by the app) rejects the prepared statements
// drizzle-kit relies on.
const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL_MIGRATIONS (or DATABASE_URL) is not set. Copy .env.example to .env.local."
  );
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
