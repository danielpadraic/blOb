-- Optional How-Bob-talks preference. Safe to re-run if 20260818210000 already applied.
-- NOTIFY pgrst reloads PostgREST's schema cache so clients stop seeing PGRST204
-- ("Could not find the 'motivation_tone' column of 'profiles' in the schema cache").
-- After this migration, the API cache must reload; this NOTIFY does that.

alter table public.profiles
  add column if not exists motivation_tone text;

alter table public.profiles drop constraint if exists profiles_motivation_tone_check;
alter table public.profiles
  add constraint profiles_motivation_tone_check
  check (motivation_tone is null or motivation_tone in ('gentle', 'neutral', 'honest'));

comment on column public.profiles.motivation_tone is
  'Optional UI copy tone. gentle | neutral | honest. Owner-only via get_my_profile(); not on public profile selects.';

notify pgrst, 'reload schema';
