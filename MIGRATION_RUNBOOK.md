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

Select the player and club using the icon next to the manual before analysis. All downloads (analysis JSON, analysis PDFs, R10 profile PDFs, and frame PNGs) use `player-club-local-date-source_kind.extension` filenames; the player name is omitted for unregistered players. The kind distinguishes analysis stages, frame views, and R10 profile numbers. R10 reports use the original CSV source name. Normal analysis JSON saves include available analysis 1/2/3 graph data and end with `_analysis.json`.

In A/B comparison, open **선수 스윙변화 확인**, choose the local folder containing the saved analysis JSON files, and filter by player, club, and analysis date. Select two to four files to compare; selections remain when changing player or date. Choosing a specific club deselects incompatible files and clears their comparison results so iron and driver files cannot bypass the club filter. File cards show filenames in parentheses. Comparing graphs does not restore or overwrite the active analysis and does not require the original videos. Older projects can be compared when their saved points and source aspect ratios are sufficient to reconstruct the graphs.

No separate history registration or Supabase swing-history migration is required. Files are read locally and are not uploaded. The folder must be selected again after reopening or refreshing the page, and after adding new files to the folder.

Selecting another folder appends files without clearing existing selections or comparison results. Identical JSON content is deduplicated by SHA-256; different contents with the same filename remain separate. Use **선택 파일 목록에서 제외** to remove checked files (up to four at a time) from the in-memory list after confirmation. Original files on disk are never deleted; removed files can be imported again.

Front hand and C7/core graphs appear in both analysis 2 and 3. They use F1 A address, F1 B top and F6 B impact, or F4 B impact when F6 is absent. Existing analysis-2-only JSONs can reconstruct all three front paths from these saved landmarks, source aspect ratios and increasing timestamps. Different video sources are never joined.

Swing-change comparisons show five separate graphs: front hands, side hands, C7/core XY, C7/core horizontal X and C7/core vertical Y. Valid saved snapshot series are retained; missing series are reconstructed from raw inputs. X/Y component plots use normalized saved-video progress (address 0%, impact 100%), not physical speed or phase alignment. Missing timing or side-view inputs are reported rather than fabricated. All displayed charts are included in comparison PDFs.

Comparison checkpoints use circles for address, triangles for backswing top and squares for impact. Repeated point labels, file numbers and leader lines are omitted. Hover tooltips retain the date, hands/C7/core, phase and coordinates. Date colors, C7 dashed lines, core (pelvis center) dotted lines and phase markers are explained below each graph. Legacy F1 A/F1 B/F6 B phase labels are recognized; F4 B is marked as impact only at saved 100% progress. Missing checkpoints are never inferred from array order. PDFs use the same markers and legends without callout labels.

The five comparison charts use independent native details/summary disclosures; only the first starts open. C7/core checkboxes independently filter each chart and refit its axes to the selected series without changing saved data or other charts. C7 paths and larger hollow markers are drawn above core dotted paths and filled markers, so coincident paths remain distinguishable. Missing C7 input is explicitly labeled and its checkbox disabled. PDF export expands cloned charts using `expandPdfDetails` while preserving on-screen disclosures and each chart's selected metrics.

Front C7/core raw inputs are grouped and sorted by saved video time, not frame IDs or input insertion order. Imported snapshot series with complete progress values are stably sorted by progress for both paths and endpoint comparisons; rendering also enforces that order without mutating input. Tooltips show connection order and available progress. Untimed legacy C7/core XY series retain saved sample order with an explicit unverified-order warning. These front landmarks do not imply a complete side-hand P1-P7 sequence.

Analysis 2/3 and comparison front graphs share direction labels through `getFrontGraphDirectionLabels`: for right-handed, unmirrored face-on footage, +X (image right) is player left/target side and -X is player right/backswing side. Coordinates, saved percentages, and scoring are unchanged; no handedness detection or automatic mirroring is added. Side-hand graphs retain image-left/right labels. The assumption and exceptions appear in the graph notes and are included in PDFs.

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
