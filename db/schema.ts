// Drizzle schema — the 12-table model is specified in SCHEMA_DESIGN.md (v2)
// and gets written in task 1.1. Phase 0 proves only the migration pipeline.
// All money columns: bigint fils, mode "number" (SCHEMA_DESIGN §7).

import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

// Trivial pipeline-proof table (task 0.2 done-criteria). Replaced in 1.1.
export const migrationSmokeTest = pgTable("_migration_smoke_test", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
