-- Consistency vs Points challenge model.
-- Safe to re-run: IF NOT EXISTS / null backfill.

alter table public.challenges
  add column if not exists frequency text default 'daily';

alter table public.challenges
  add column if not exists target_count int;

alter table public.challenges
  add column if not exists tasks jsonb default '[]'::jsonb;

update public.challenges
  set target_count = coalesce(target_count, days_required, 6)
  where target_count is null;

update public.challenges
  set frequency = coalesce(frequency, 'daily')
  where frequency is null;

update public.challenges
  set tasks = '[]'::jsonb
  where tasks is null;

update public.challenges
  set challenge_type = 'consistency'
  where challenge_type is distinct from 'points';

alter table public.challenges
  alter column target_count set default 6;

alter table public.challenges
  alter column target_count set not null;

alter table public.challenges
  alter column tasks set default '[]'::jsonb;

alter table public.challenges
  drop constraint if exists target_count_positive;

alter table public.challenges
  add constraint target_count_positive check (target_count > 0);

comment on column public.challenges.challenge_type is 'Primary scoring model: consistency (hit a log target) or points (complete custom tasks).';
comment on column public.challenges.frequency is 'How often a consistency log counts: daily, weekly, monthly, or once.';
comment on column public.challenges.target_count is 'Successful logs required to finish a consistency challenge.';
comment on column public.challenges.tasks is 'Points-challenge task list: id, title, points, proof_required, proof_types.';
