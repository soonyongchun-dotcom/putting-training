-- 02_rls_baseline_policies.sql
-- Baseline RLS policies for SY-EGTP tables.
-- Assumption: Auth users are mapped to sytpt_users.id via app email alias rule.

begin;

-- Enable RLS on target tables
alter table if exists public.sytpt_users enable row level security;
alter table if exists public.sytpt_messages enable row level security;
alter table if exists public.sytpt_coach_directives enable row level security;
alter table if exists public.sytpt_assigned_missions enable row level security;
alter table if exists public.sytpt_mission_progress enable row level security;
alter table if exists public.sytpt_self_eval enable row level security;
alter table if exists public.sytpt_match_info enable row level security;

-- Helper functions
create or replace function public.app_login_id_from_email(p_email text)
returns text
language sql
immutable
as $$
  select
    case
      when p_email is null then null
      when position('@' in p_email) > 1 then split_part(lower(trim(p_email)), '@', 1)
      else null
    end
$$;

create or replace function public.app_auth_login_id()
returns text
language sql
stable
as $$
  select coalesce(
    public.app_alias_from_login_id((auth.jwt() -> 'user_metadata' ->> 'login_id')),
    public.app_login_id_from_email((auth.jwt() ->> 'email'))
  )
$$;

create or replace function public.app_alias_from_login_id(p_login_id text)
returns text
language sql
immutable
as $$
  select
    case
      when p_login_id is null then null
      when trim(p_login_id) = '' then null
      when p_login_id ~ '^[a-zA-Z0-9._-]+$' then lower(trim(p_login_id))
      else 'id' || substring(encode(convert_to(lower(trim(p_login_id)), 'UTF8'), 'hex') from 1 for 48)
    end
$$;

create or replace function public.app_is_coach()
returns boolean
language sql
stable
as $$
  select coalesce(lower((auth.jwt() -> 'user_metadata' ->> 'role')), '') = 'coach'
$$;

create or replace function public.app_is_same_player(p_player_id text)
returns boolean
language sql
stable
as $$
  select public.app_alias_from_login_id(p_player_id) = public.app_auth_login_id()
$$;

-- Clean previous policies (idempotent)
drop policy if exists sytpt_users_select_self_or_coach on public.sytpt_users;
drop policy if exists sytpt_users_update_self_or_coach on public.sytpt_users;
drop policy if exists sytpt_users_insert_coach_only on public.sytpt_users;
drop policy if exists sytpt_users_insert_player_signup on public.sytpt_users;

drop policy if exists sytpt_messages_select_own_or_coach on public.sytpt_messages;
drop policy if exists sytpt_messages_modify_own_or_coach on public.sytpt_messages;

drop policy if exists sytpt_coach_directives_select_own_or_coach on public.sytpt_coach_directives;
drop policy if exists sytpt_coach_directives_modify_coach_or_own on public.sytpt_coach_directives;

drop policy if exists sytpt_assigned_missions_select_own_or_coach on public.sytpt_assigned_missions;
drop policy if exists sytpt_assigned_missions_modify_own_or_coach on public.sytpt_assigned_missions;

drop policy if exists sytpt_mission_progress_select_own_or_coach on public.sytpt_mission_progress;
drop policy if exists sytpt_mission_progress_modify_own_or_coach on public.sytpt_mission_progress;

drop policy if exists sytpt_self_eval_select_own_or_coach on public.sytpt_self_eval;
drop policy if exists sytpt_self_eval_modify_own_or_coach on public.sytpt_self_eval;

drop policy if exists sytpt_match_info_select_own_or_coach on public.sytpt_match_info;
drop policy if exists sytpt_match_info_modify_own_or_coach on public.sytpt_match_info;

-- sytpt_users policies
create policy sytpt_users_select_self_or_coach
on public.sytpt_users
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(id)
);

create policy sytpt_users_update_self_or_coach
on public.sytpt_users
for update
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(id)
);

create policy sytpt_users_insert_coach_only
on public.sytpt_users
for insert
to authenticated
with check (public.app_is_coach());

create policy sytpt_users_insert_player_signup
on public.sytpt_users
for insert
to authenticated
with check (
  lower(coalesce(role,''))='player'
  and lower(coalesce(approval_status,''))='pending'
  and not public.app_is_coach()
  and public.app_is_same_player(id)
);

-- Generic table policy template for player_id tables
create policy sytpt_messages_select_own_or_coach
on public.sytpt_messages
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_messages_modify_own_or_coach
on public.sytpt_messages
for all
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_coach_directives_select_own_or_coach
on public.sytpt_coach_directives
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_coach_directives_modify_coach_or_own
on public.sytpt_coach_directives
for all
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_assigned_missions_select_own_or_coach
on public.sytpt_assigned_missions
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_assigned_missions_modify_own_or_coach
on public.sytpt_assigned_missions
for all
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_mission_progress_select_own_or_coach
on public.sytpt_mission_progress
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_mission_progress_modify_own_or_coach
on public.sytpt_mission_progress
for all
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_self_eval_select_own_or_coach
on public.sytpt_self_eval
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_self_eval_modify_own_or_coach
on public.sytpt_self_eval
for all
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_match_info_select_own_or_coach
on public.sytpt_match_info
for select
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

create policy sytpt_match_info_modify_own_or_coach
on public.sytpt_match_info
for all
to authenticated
using (
  public.app_is_coach() or public.app_is_same_player(player_id)
)
with check (
  public.app_is_coach() or public.app_is_same_player(player_id)
);

commit;
