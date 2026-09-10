-- Add `rofl` to public.reactions. Do not apply from the app.
-- Paste this in the Supabase SQL Editor when you are ready.

alter table public.reactions drop constraint if exists reaction_type_known;

alter table public.reactions
  add constraint reaction_type_known
  check (reaction_type in (
    'like',
    'love',
    'care',
    'fire',
    'sad',
    'laugh',
    'shock',
    'applause',
    'praise',
    'rofl'
  ));
