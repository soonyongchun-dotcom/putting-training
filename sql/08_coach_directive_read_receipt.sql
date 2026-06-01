-- 08_coach_directive_read_receipt.sql
-- Adds read-receipt column so coach can see whether player opened directives.

alter table if exists public.sytpt_coach_directives
  add column if not exists player_read_at timestamptz;

comment on column public.sytpt_coach_directives.player_read_at is
  'Timestamp when player first viewed coach directive in Coach Communication.';

create index if not exists idx_sytpt_coach_directives_player_read_at
  on public.sytpt_coach_directives (player_id, player_read_at);
