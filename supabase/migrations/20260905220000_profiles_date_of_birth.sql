-- Bring profiles.date_of_birth into tracked SQL.
--
-- The column already exists in the live project, but nothing in this repo creates it: not
-- schema.sql, not any migration. Two things already depend on it — official_dob_status() in
-- 20260902133603_interests_slice_one.sql, and the workout intensity gate, which needs an age to
-- work out the heart rate a workout must reach. A database rebuilt from these files would be
-- missing both.
--
-- Idempotent by design, so this is a no-op against the live project and only does work on a fresh
-- rebuild. Private like gender: read through get_my_profile(), never exposed on a public profile.

alter table public.profiles add column if not exists date_of_birth date;

comment on column public.profiles.date_of_birth is
  'PRIVATE. Read via get_my_profile(). Used for the official 18+ gate and to derive the age behind the elevated heart rate proof threshold. Never returned on a public profile.';
