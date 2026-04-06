-- 01_password_column_deprecation.sql
-- Purpose: Safely retire legacy password column in sytpt_users.
-- Run after Auth migration and login verification are complete.

begin;

-- 1) Optional backup snapshot before destructive change
create table if not exists public.sytpt_users_password_backup as
select id, password, now() as backed_up_at
from public.sytpt_users
where false;

insert into public.sytpt_users_password_backup (id, password, backed_up_at)
select id, password, now()
from public.sytpt_users
where password is not null
  and not exists (
    select 1
    from public.sytpt_users_password_backup b
    where b.id = sytpt_users.id
  );

-- 2) Drop legacy password column
alter table public.sytpt_users
  drop column if exists password;

commit;
