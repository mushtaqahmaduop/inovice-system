import { defineConfig } from "drizzle-kit";

// Migrations run STAGING-FIRST, always (BUILD_PHASES rule 5).
// DATABASE_URL comes from .env.local — never committed (CLAUDE.md §1).
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
