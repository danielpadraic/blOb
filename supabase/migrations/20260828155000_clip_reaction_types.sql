-- Player picker: like / heart / fire / laugh / sad / shock / applause / praise.
-- Live table is public.reactions (product name post_reactions).

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
    'praise'
  ));
