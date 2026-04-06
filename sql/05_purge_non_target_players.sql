-- 05_purge_non_target_players.sql
-- Keep only selected player IDs in public tables and purge all others.
-- Target keep list: Heejee0309, 유수연, 이정우

begin;

-- 0) Preview targets before delete
-- select id, name, role, approval_status
-- from public.sytpt_users
-- where role = 'player'
--   and id not in ('Heejee0309', '유수연', '이정우')
-- order by id;

-- 1) Remove player-linked data first
with targets as (
  select id
  from public.sytpt_users
  where role = 'player'
    and id not in ('Heejee0309', '유수연', '이정우')
)
delete from public.sytpt_messages m
using targets t
where m.player_id = t.id;

with targets as (
  select id
  from public.sytpt_users
  where role = 'player'
    and id not in ('Heejee0309', '유수연', '이정우')
)
delete from public.sytpt_coach_directives d
using targets t
where d.player_id = t.id;

with targets as (
  select id
  from public.sytpt_users
  where role = 'player'
    and id not in ('Heejee0309', '유수연', '이정우')
)
delete from public.sytpt_assigned_missions a
using targets t
where a.player_id = t.id;

with targets as (
  select id
  from public.sytpt_users
  where role = 'player'
    and id not in ('Heejee0309', '유수연', '이정우')
)
delete from public.sytpt_mission_progress p
using targets t
where p.player_id = t.id;

with targets as (
  select id
  from public.sytpt_users
  where role = 'player'
    and id not in ('Heejee0309', '유수연', '이정우')
)
delete from public.sytpt_self_eval s
using targets t
where s.player_id = t.id;

with targets as (
  select id
  from public.sytpt_users
  where role = 'player'
    and id not in ('Heejee0309', '유수연', '이정우')
)
delete from public.sytpt_match_info mi
using targets t
where mi.player_id = t.id;

-- 2) Remove player rows from profile table
delete from public.sytpt_users u
where u.role = 'player'
  and u.id not in ('Heejee0309', '유수연', '이정우');

commit;

-- 3) Verify result
select role, id, name, approval_status
from public.sytpt_users
where role = 'player'
order by id;
