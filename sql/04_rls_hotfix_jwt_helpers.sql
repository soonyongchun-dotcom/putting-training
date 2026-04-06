-- 04_rls_hotfix_jwt_helpers.sql
-- Hotfix for coach data visibility when RLS helper recursion blocks access.
-- Run this in Supabase SQL Editor immediately.

begin;

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

commit;

-- Quick checks (run after login as coach in app):
-- select public.app_is_coach() as is_coach, public.app_auth_login_id() as auth_login_id;
-- select count(*) from public.sytpt_messages;
