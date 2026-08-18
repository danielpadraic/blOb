-- How Bob talks to you. Safe to re-run.

alter table public.profiles
  add column if not exists motivation_tone text not null default 'neutral';

alter table public.profiles drop constraint if exists profiles_motivation_tone_check;
alter table public.profiles
  add constraint profiles_motivation_tone_check
  check (motivation_tone in ('gentle', 'neutral', 'honest'));

comment on column public.profiles.motivation_tone is
  'UI copy tone. gentle | neutral | honest. Default neutral.';
