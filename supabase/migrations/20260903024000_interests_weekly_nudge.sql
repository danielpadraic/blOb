-- Weekly Home reminder to finish incomplete Interests rooms.
-- Additive on live stamp 20260903021854. RLS unchanged.
-- Owner writes via profiles UPDATE; get_my_profile() already returns select *.

alter table public.profiles
  add column if not exists interests_nudge_at timestamptz;

comment on column public.profiles.interests_nudge_at is
  'Last time the weekly Home Interests reminder was shown or dismissed. Clock starts from interests_dismissed_home_at until this is set.';
