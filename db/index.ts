import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Server-only database client. The service-role key is NEVER used for
// ordinary reads/writes (SCHEMA_DESIGN §5) — user-scoped Supabase clients
// handle authenticated access; this connection is for migrations/system use.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// Supabase pooler (transaction mode) requires prepare: false.
const client = postgres(process.env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
