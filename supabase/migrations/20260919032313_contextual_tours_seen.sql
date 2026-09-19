-- First-seen coaches (Live, Home pills, Lift). Separate from tutorial_completed_at.
-- Owner writes via profiles UPDATE; get_my_profile() already returns select *.
-- Does not change settlement, check-in RPCs, or the first-run Home tour.

alter table public.profiles
  add column if not exists contextual_tours_seen jsonb not null default '[]'::jsonb;

comment on column public.profiles.contextual_tours_seen is
  'Owner first-seen coaches: home-live-pills, challenge-live, lift. Separate from tutorial_completed_at.';
