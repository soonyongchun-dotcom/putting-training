-- 03_rls_apply_and_verify_packet.sql
-- Run this in Supabase SQL Editor after Auth migration.
-- Step A: First execute sql/02_rls_baseline_policies.sql
-- Step B: Run the verification queries below

-- 1) Verify RLS enabled state
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'sytpt_users',
    'sytpt_messages',
    'sytpt_coach_directives',
    'sytpt_assigned_missions',
    'sytpt_mission_progress',
    'sytpt_self_eval',
    'sytpt_match_info'
  )
order by tablename;

-- 2) Verify policies created
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'sytpt_users',
    'sytpt_messages',
    'sytpt_coach_directives',
    'sytpt_assigned_missions',
    'sytpt_mission_progress',
    'sytpt_self_eval',
    'sytpt_match_info'
  )
order by tablename, policyname;

-- 3) Optional safety check before password drop
--    Run only after successful coach/player login verification.
select column_name
from information_schema.columns
where table_schema='public'
  and table_name='sytpt_users'
  and column_name='password';
