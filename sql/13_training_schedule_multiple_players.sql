-- Add optional multi-player schedule assignment while preserving existing schedules.
-- Run after sql/12_training_schedules.sql.

begin;

alter table public.sytpt_training_schedules
  add column if not exists player_ids text[] not null default '{}'::text[];

update public.sytpt_training_schedules
set player_ids = array[player_id]
where player_id is not null
  and cardinality(player_ids)=0;

drop policy if exists sytpt_training_schedules_select_visible
  on public.sytpt_training_schedules;

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
