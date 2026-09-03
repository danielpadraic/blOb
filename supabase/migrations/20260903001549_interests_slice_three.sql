-- Interests slice 3: persist Start-this sheet cap per room.
-- Additive on live stamp 20260902222100. RLS unchanged.

alter table public.profile_interest_rooms
  add column if not exists start_this_dismissed_at timestamptz;

comment on column public.profile_interest_rooms.start_this_dismissed_at is
  'Set when the user starts or dismisses the post-room Start this sheet. One sheet per room.';
