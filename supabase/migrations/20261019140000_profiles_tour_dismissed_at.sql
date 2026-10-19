-- Don’t show again. One timestamp, so a dismissed coach does not replay or move Live.
alter table public.profiles
  add column if not exists tour_dismissed_at timestamptz;

comment on column public.profiles.tour_dismissed_at is
  'Set when the owner taps Don’t show again. Coaches stay off.';
