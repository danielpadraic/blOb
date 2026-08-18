-- Prize structure: winner take all, equal split, or top places.
-- Safe to re-run.

alter table public.challenges
  add column if not exists prize_structure text default 'equal_split';

alter table public.challenges
  add column if not exists top_places_mode text;

alter table public.challenges
  add column if not exists top_places_value int;

alter table public.challenges
  add column if not exists top_places_distribution text;

update public.challenges
  set prize_structure = 'equal_split'
  where prize_structure is null;

alter table public.challenges
  alter column prize_structure set default 'equal_split';

alter table public.challenges
  alter column prize_structure set not null;

comment on column public.challenges.prize_structure is 'How the prize pool is paid out: winner_take_all, equal_split, or top_places.';
comment on column public.challenges.top_places_mode is 'For top_places: percent of finishers, or a fixed count.';
comment on column public.challenges.top_places_value is 'For top_places: 10 means top 10% or top 10 people.';
comment on column public.challenges.top_places_distribution is 'For top_places: even split or scaled so 1st earns the most.';
