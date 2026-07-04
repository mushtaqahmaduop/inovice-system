-- Custom migration: what drizzle-kit cannot express (SCHEMA_DESIGN v2).
-- 1) pg_trgm + trigram indexes for global search (D-18):
--    customers.name, and the expression index on the invoice snapshot name
--    so issued invoices stay findable by walk-in name even after the
--    customer record changes [#11].
-- 2) profiles.id → auth.users FK (Supabase pattern; profile dies with the
--    auth user).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "customers_name_trgm_idx" ON "customers" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "invoices_snapshot_name_trgm_idx" ON "invoices" USING gin ((customer_snapshot->>'name') gin_trgm_ops);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_fk" FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;
