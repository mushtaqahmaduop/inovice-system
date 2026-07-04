CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes" USING btree ("user_id");
--> statement-breakpoint

-- Hand-written companion (task 2.1 [#24]): auth FK + owner-scoped RLS.
-- Codes die with the auth user. Owners manage only their OWN codes; there is
-- deliberately no admin-wide policy — recovery for a locked-out admin goes
-- through docs/RUNBOOK-admin-mfa-recovery.md, not through another account.
ALTER TABLE "mfa_recovery_codes"
  ADD CONSTRAINT "mfa_recovery_codes_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.mfa_recovery_codes FROM anon;
--> statement-breakpoint
CREATE POLICY mfa_recovery_codes_select_own ON public.mfa_recovery_codes
  FOR SELECT USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY mfa_recovery_codes_insert_own ON public.mfa_recovery_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY mfa_recovery_codes_update_own ON public.mfa_recovery_codes
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY mfa_recovery_codes_delete_own ON public.mfa_recovery_codes
  FOR DELETE USING (user_id = auth.uid());