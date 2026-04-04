# One-pass migration runbook

## Goal
- Existing coach/player account login should work via Supabase Auth only.
- Apply migration and move to the next hardening stage in one flow.

## Prerequisites
- Service role key is required.
- Node.js is installed.

## Execute (PowerShell)
```powershell
.\scripts\run-full-auth-migration.ps1 `
  -SupabaseUrl "https://<project-ref>.supabase.co" `
  -ServiceRoleKey "<service-role-key>" `
  -Execute
```

Optional:
- `-DefaultPassword "TempPass123!"` to force generated accounts to use one temporary password.
- `-SkipSql` if you only want Auth migration first.

## SQL phase (Supabase SQL Editor)
1. Run sql/02_rls_baseline_policies.sql
2. Run sql/03_rls_apply_and_verify_packet.sql
3. Verify coach/player login
4. Run sql/01_password_column_deprecation.sql

## If coach sees no existing data
1. Run sql/04_rls_hotfix_jwt_helpers.sql
2. Logout/login again and refresh
3. Re-check coach screens (athletes, messages, directives)

## Optional CLI token check
```powershell
.\scripts\apply-next-sql-step.ps1 -AccessToken "<supabase_pat_sbp_...>"
```

## Verification checklist
- Coach login succeeds with migrated credentials.
- Player approved login succeeds.
- Player pending/inactive is blocked.
- Logout clears app session and Auth session.
