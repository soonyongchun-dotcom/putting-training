param(
  [Parameter(Mandatory=$true)][string]$AccessToken
)

$ErrorActionPreference = "Stop"
$env:SUPABASE_ACCESS_TOKEN = $AccessToken

Write-Host "[Check] Supabase CLI access token validity"
supabase projects list | Out-Host

Write-Host ""
Write-Host "Next manual SQL steps in Supabase SQL Editor:"
Write-Host "1) Run sql/02_rls_baseline_policies.sql"
Write-Host "2) Run sql/03_rls_apply_and_verify_packet.sql"
Write-Host "3) After login verification, run sql/01_password_column_deprecation.sql"
