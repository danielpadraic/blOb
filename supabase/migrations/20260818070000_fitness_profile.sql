-- Private training background for challenge matching / placement.
-- Clients read fitness_profile through get_my_profile() (select *), not table SELECT grants.

alter table public.profiles
  add column if not exists fitness_profile jsonb;

comment on column public.profiles.fitness_profile is
  'PRIVATE jsonb training background (experience, goal, sports, limitations, equipment). Read via get_my_profile().';
