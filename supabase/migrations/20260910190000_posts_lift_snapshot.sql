-- Frozen lift on a check-in / share post so viewers can open the card after the
-- live session is deleted or unreadable. Does not change lift_sessions RLS.

alter table public.posts
  add column if not exists lift_snapshot jsonb;

comment on column public.posts.lift_snapshot is
  'Snapshot of the attached lift (roster + last numbers). Viewers open this; Add deep-copies it.';
