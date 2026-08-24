alter table public.challenges
  add column if not exists scoring_method text,
  add column if not exists scoring_config jsonb;

comment on column public.challenges.scoring_method is
  'Leaderboard scoring method. comparable_points uses scoring_config.';
comment on column public.challenges.scoring_config is
  'Method-specific jsonb. For comparable_points: { version, parity_points, activities[] }.';
