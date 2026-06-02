-- 10_player_rounds_unique_constraint.sql
-- Adds a proper UNIQUE CONSTRAINT to sytpt_player_rounds so that PostgREST
-- can resolve on_conflict=player_id,round_date,course correctly.
-- Run this in Supabase SQL Editor if the table already exists.

begin;

-- Remove the plain unique index (if it exists) and replace with a named constraint.
-- The constraint internally creates its own unique index.
alter table public.sytpt_player_rounds
  drop constraint if exists uq_sytpt_player_rounds_player_date_course;

drop index if exists public.idx_sytpt_player_rounds_unique;

alter table public.sytpt_player_rounds
  add constraint uq_sytpt_player_rounds_player_date_course
  unique (player_id, round_date, course);

commit;
