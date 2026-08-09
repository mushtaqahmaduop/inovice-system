ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint

-- Three fields the admin console needs to actually govern accounts, rather
-- than only list them (owner request 2026-08-10, "the admin should have more
-- command"). All three hang off profiles, which already has the right RLS
-- shape: profiles_update_admin is a TABLE-level policy, so new columns are
-- covered by it automatically and no grant changes are needed.
--
-- phone — a staff contact number. It lives here and NOT in auth.users.phone
-- because that column is GoTrue's SMS-login identity: writing to it would
-- start treating the number as a second sign-in credential. This is an
-- address-book field, nothing more. Nullable by design; the shop hired
-- people before it asked for their numbers.
--
-- must_change_password — set by an admin, cleared by the user completing
-- /update-password. Enforced in middleware, so it survives a direct URL and
-- cannot be clicked past in the UI. Default false, so this migration changes
-- the behaviour of exactly zero existing accounts: nobody is locked into the
-- reset form until an admin deliberately flips the flag.
--
-- archived_at — the "delete user" the mockup asks for, done honestly.
-- invoice_events.actor_id and deleted_drafts point at profiles.id, so erasing
-- a row would blank the actor on invoices that must stay auditable for five
-- years (CLAUDE.md §3.4, §4). Archiving instead keeps the name attached to
-- the history and takes the account out of the working list. It is a state,
-- not a tombstone: an admin can restore it.
--
-- No CHECK tying archived_at to is_active=false. The API always sets the two
-- together, and a constraint here would make the restore path order-dependent
-- for no real protection.
CREATE INDEX IF NOT EXISTS "profiles_archived_at_idx" ON "profiles" ("archived_at");
