-- Player anthropometrics and measured R10 outcomes for later model calibration.
-- Run in Supabase SQL Editor after the application identity/RLS helpers are installed.
-- player_id must use the same identifier accepted by public.app_is_same_player().

begin;

create table if not exists public.player_biometrics (
  player_id text primary key,
  height_cm numeric(5, 2) not null check (height_cm between 100 and 240),
  weight_kg numeric(5, 2) not null check (weight_kg between 30 and 300),
  lean_mass_kg numeric(5, 2) check (
    lean_mass_kg is null or (lean_mass_kg between 20 and 200 and lean_mass_kg <= weight_kg)
  ),
  measured_at date,
  source text not null default 'self_reported'
    check (source in ('self_reported', 'measured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_r10_shots (
  id uuid primary key default gen_random_uuid(),
  player_id text not null references public.player_biometrics(player_id) on delete cascade,
  source_session_id uuid not null,
  shot_no integer not null check (shot_no > 0),
  shot_date timestamptz,
  club_type text,
  total_distance_m numeric(7, 2) check (total_distance_m is null or total_distance_m between 0 and 600),
  club_head_speed_mps numeric(6, 3) check (club_head_speed_mps is null or club_head_speed_mps between 0 and 100),
  ball_speed_mps numeric(6, 3) check (ball_speed_mps is null or ball_speed_mps between 0 and 120),
  smash_factor numeric(5, 3) check (smash_factor is null or smash_factor between 0 and 2),
  raw_units jsonb not null default '{}'::jsonb,
  source_name text,
  created_at timestamptz not null default now(),
  unique (player_id, source_session_id, shot_no)
);

alter table public.player_biometrics enable row level security;
alter table public.player_r10_shots enable row level security;

drop policy if exists player_biometrics_select_self_or_coach on public.player_biometrics;
create policy player_biometrics_select_self_or_coach
  on public.player_biometrics for select to authenticated
  using (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_biometrics_insert_self_or_coach on public.player_biometrics;
create policy player_biometrics_insert_self_or_coach
  on public.player_biometrics for insert to authenticated
  with check (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_biometrics_update_self_or_coach on public.player_biometrics;
create policy player_biometrics_update_self_or_coach
  on public.player_biometrics for update to authenticated
  using (public.app_is_coach() or public.app_is_same_player(player_id))
  with check (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_biometrics_delete_self_or_coach on public.player_biometrics;
create policy player_biometrics_delete_self_or_coach
  on public.player_biometrics for delete to authenticated
  using (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_r10_shots_select_self_or_coach on public.player_r10_shots;
create policy player_r10_shots_select_self_or_coach
  on public.player_r10_shots for select to authenticated
  using (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_r10_shots_insert_self_or_coach on public.player_r10_shots;
create policy player_r10_shots_insert_self_or_coach
  on public.player_r10_shots for insert to authenticated
  with check (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_r10_shots_update_self_or_coach on public.player_r10_shots;
create policy player_r10_shots_update_self_or_coach
  on public.player_r10_shots for update to authenticated
  using (public.app_is_coach() or public.app_is_same_player(player_id))
  with check (public.app_is_coach() or public.app_is_same_player(player_id));

drop policy if exists player_r10_shots_delete_self_or_coach on public.player_r10_shots;
create policy player_r10_shots_delete_self_or_coach
  on public.player_r10_shots for delete to authenticated
  using (public.app_is_coach() or public.app_is_same_player(player_id));

create index if not exists idx_player_r10_shots_player_session
  on public.player_r10_shots (player_id, source_session_id);

commit;
