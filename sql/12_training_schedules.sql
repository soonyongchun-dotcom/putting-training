-- Cloud storage for shared and player-specific training schedules.
-- Requires public.app_is_coach() and public.app_is_same_player() from the RLS baseline.

begin;

create table if not exists public.sytpt_training_schedules (
  schedule_id text primary key,
  player_id text,
  player_name text,
  player_ids text[] not null default '{}'::text[],
  schedule_payload jsonb not null
    check (jsonb_typeof(schedule_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sytpt_training_schedules enable row level security;

drop policy if exists sytpt_training_schedules_select_visible on public.sytpt_training_schedules;
drop policy if exists sytpt_training_schedules_coach_manage on public.sytpt_training_schedules;

create policy sytpt_training_schedules_select_visible
  on public.sytpt_training_schedules
  for select
  to authenticated
  using (
    public.app_is_coach()
    or (
      player_id is null
      and cardinality(player_ids)=0
    )
    or public.app_is_same_player(player_id)
    or exists (
      select 1
      from unnest(player_ids) as assigned(assigned_player_id)
      where public.app_is_same_player(assigned.assigned_player_id)
    )
  );

create policy sytpt_training_schedules_coach_manage
  on public.sytpt_training_schedules
  for all
  to authenticated
  using (public.app_is_coach())
  with check (public.app_is_coach());

revoke all on public.sytpt_training_schedules from anon;
grant select, insert, update, delete on public.sytpt_training_schedules to authenticated;

create or replace function public.reset_sytpt_training_schedules(p_schedules jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.app_is_coach() then
    raise exception 'Only coaches can reset training schedules';
  end if;

  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'Schedules must be provided as a JSON array';
  end if;

  delete from public.sytpt_training_schedules;

  insert into public.sytpt_training_schedules (
    schedule_id,
    player_id,
    player_name,
    player_ids,
    schedule_payload
  )
  select
    item.schedule_id,
    item.player_id,
    item.player_name,
    coalesce(item.player_ids, '{}'::text[]),
    item.schedule_payload
  from jsonb_to_recordset(p_schedules) as item(
    schedule_id text,
    player_id text,
    player_name text,
    player_ids text[],
    schedule_payload jsonb
  );
end;
$$;

revoke all on function public.reset_sytpt_training_schedules(jsonb) from public, anon;
grant execute on function public.reset_sytpt_training_schedules(jsonb) to authenticated;

commit;
