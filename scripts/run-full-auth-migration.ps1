param(
  [Parameter(Mandatory=$true)][string]$SupabaseUrl,
  [Parameter(Mandatory=$true)][string]$ServiceRoleKey,
  [string]$DefaultPassword = "",
  [switch]$SkipSql,
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

Write-Host "[1/4] Set environment variables for migration script"
$env:SUPABASE_URL = $SupabaseUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $ServiceRoleKey
if ($DefaultPassword) { $env:MIGRATION_DEFAULT_PASSWORD = $DefaultPassword }

Write-Host "[2/4] DRY RUN migration"
$env:DRY_RUN = "true"
node .\scripts\migrate-users-to-auth.mjs

if (-not $Execute) {
  Write-Host "Dry run completed. Re-run with -Execute to apply changes."
  exit 0
}

Write-Host "[3/4] EXECUTE migration"
$env:DRY_RUN = "false"
node .\scripts\migrate-users-to-auth.mjs

if ($SkipSql) {
  Write-Host "Migration done. SQL phase skipped by -SkipSql."
  exit 0
}

Write-Host "[4/4] Next SQL files to run in Supabase SQL Editor (in order):"
Write-Host "  - sql/02_rls_baseline_policies.sql"
Write-Host "  - sql/01_password_column_deprecation.sql"
Write-Host "IMPORTANT: Run password drop only after login verification."
