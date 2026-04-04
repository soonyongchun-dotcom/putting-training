-- 06_rls_allow_player_signup_insert.sql
-- Hotfix: allow authenticated players to create their own pending profile row
-- in public.sytpt_users during web signup flow.

begin;

drop policy if exists sytpt_users_insert_player_signup on public.sytpt_users;

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

commit;
