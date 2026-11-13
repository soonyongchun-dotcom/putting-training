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
5. Run sql/12_training_schedules.sql to enable cloud-backed training schedules and player/coach RLS.
6. Run sql/13_training_schedule_multiple_players.sql to enable optional all-player announcements and multi-player assignments.

Training schedule data is migrated from the browser's existing `golfSeedAppConfigV5` cache the first time a coach opens the schedule page while the cloud schedule table is empty. Later loads use Supabase as the source of truth; player accounts receive shared schedules and schedules assigned to them.

Creating a schedule saves an empty schedule immediately. Coaches must click **훈련 일정 저장** above or below the table after editing the title, dates, location, rows, or importing Excel data. Edits are not automatically saved. Unsaved edits block background reloads when returning to the tab, and leaving/reloading the page prompts for confirmation. Save errors remain visible and edits are retained for retry. Verify persistence by saving and then refreshing the page.

## Analysis JSON comparisons

Select the player and club using the icon next to the manual before analysis. All downloads (analysis JSON, analysis PDFs, R10 profile PDFs, and frame PNGs) use `player-club-local-date-source_kind.extension` filenames; the player name is omitted for unregistered players. The kind distinguishes analysis stages, frame views, and R10 profile numbers. R10 reports use the original CSV source name. Normal analysis JSON saves include available analysis 1/3 graph data and end with `_analysis.json`.

In A/B comparison, open **선수 스윙변화 확인**, choose the local folder containing the saved analysis JSON files, and filter by player, club, and analysis date. Select two to four files to compare; selections remain when changing player or date. Choosing a specific club deselects incompatible files and clears their comparison results so iron and driver files cannot bypass the club filter. File cards show filenames in parentheses. Comparing graphs does not restore or overwrite the active analysis and does not require the original videos. Older projects can be compared when their saved points and source aspect ratios are sufficient to reconstruct the graphs.

No separate history registration or Supabase swing-history migration is required. Files are read locally and are not uploaded. The folder must be selected again after reopening or refreshing the page, and after adding new files to the folder.

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
