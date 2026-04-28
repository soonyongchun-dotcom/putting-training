-- 09_player_round_sync.sql
-- Creates a shared round sync table for player-to-coach round upload and review.

begin;

create table if not exists public.sytpt_player_rounds (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  player_name text,
  round_date date,
  course text,
  distance_unit text,
  round_meta jsonb,
  round_payload jsonb,
  source text,
  exported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sytpt_player_rounds_unique
  on public.sytpt_player_rounds (player_id, round_date, course);

alter table if exists public.sytpt_player_rounds enable row level security;

create policy sytpt_player_rounds_select_self_or_coach
  on public.sytpt_player_rounds
  for select
  to authenticated
  using (
    public.app_is_coach() or public.app_is_same_player(player_id)
  );

create policy sytpt_player_rounds_insert_self_or_coach
  on public.sytpt_player_rounds
  for insert
  to authenticated
  with check (
    public.app_is_coach() or public.app_is_same_player(player_id)
  );

create policy sytpt_player_rounds_update_self_or_coach
  on public.sytpt_player_rounds
  for update
  to authenticated
  using (
    public.app_is_coach() or public.app_is_same_player(player_id)
  )
  with check (
    public.app_is_coach() or public.app_is_same_player(player_id)
  );

create policy sytpt_player_rounds_delete_self_or_coach
  on public.sytpt_player_rounds
  for delete
  to authenticated
  using (
    public.app_is_coach() or public.app_is_same_player(player_id)
  );

commit;
