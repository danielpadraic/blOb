-- Private profile columns stop being readable by every other member.
--
-- This finishes a design the schema has described since the beginning. `schema.sql` and four
-- migrations say balances, gender, body fat, fitness profile, and date of birth are "read via
-- get_my_profile(), not table SELECT grants", the README repeats it, and both `get_my_profile()`
-- and the `profiles_public` view already exist. None of it was in force: the client role held a
-- table-wide SELECT grant on all 63 columns, so any signed-in member could read every other
-- member's weight, body fat, goal weight, date of birth, and wallet balance.
--
-- The reason the original attempts failed is the same one that left the money columns writable:
-- Postgres ignores a column-level REVOKE while a table-level grant is present. Both are fixed the
-- same way -- drop the table-wide grant, then grant back by name.
--
-- Three readers, three routes:
--   * yourself          -> get_my_profile(), which already returns the whole row
--   * another member    -> the identity columns granted below, plus profiles_public for stats
--   * signed out        -> nothing, per the previous migration

-- ---------------------------------------------------------------- base table

do $$
declare
  -- Identity: the columns that make a name, a face, and a link work anywhere in the app. Everything
  -- absent from this list is private by default, including any column added later.
  readable constant text[] := array[
    'id', 'username', 'display_name', 'avatar_url', 'cover_url', 'bio',
    'skill_tags', 'created_at',
    'is_official', 'is_creator', 'is_admin',
    'allow_profile_posts', 'profile_visibility', 'show_fitness_stats_publicly'
  ];
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = any (readable);

  revoke select on public.profiles from authenticated;
  execute format('grant select (%s) on public.profiles to authenticated', cols);
end $$;

-- ---------------------------------------------------------------- profiles_public

-- The view was security_invoker, which cannot work once the caller loses column access: the view
-- would simply fail for everyone. It becomes an owner-rights view instead, which is what lets it
-- decide per row whether fitness stats are shareable. Because that bypasses row level security, the
-- signed-out role is removed from it explicitly -- the view must not become a way back in.
--
-- It also regains the identity columns the app has been asking it for. `withPayoutProfiles` selects
-- PUBLIC_PROFILE_COLUMNS here, which includes cover_url and is_official; the view never had them,
-- so that query has been failing and settlement lists have been rendering with no names or faces.
drop view if exists public.profiles_public;

create view public.profiles_public
with (security_invoker = false)
as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.cover_url,
  p.bio,
  p.skill_tags,
  p.created_at,
  p.is_official,
  p.is_creator,
  p.allow_profile_posts,
  p.profile_visibility,
  p.show_fitness_stats_publicly,
  -- Honour the switch the profile screen already offers. Your own stats always come back, so the
  -- owner sees the same numbers whether they arrive here or through get_my_profile().
  case when p.show_fitness_stats_publicly or p.id = auth.uid() then p.height_cm end as height_cm,
  case when p.show_fitness_stats_publicly or p.id = auth.uid() then p.current_weight end as current_weight,
  case when p.show_fitness_stats_publicly or p.id = auth.uid() then p.goal_weight end as goal_weight,
  case when p.show_fitness_stats_publicly or p.id = auth.uid() then p.weight_unit end as weight_unit,
  case when p.show_fitness_stats_publicly or p.id = auth.uid() then p.typical_weekly_workout_frequency end
    as typical_weekly_workout_frequency,
  case when p.show_fitness_stats_publicly or p.id = auth.uid() then p.primary_activities end as primary_activities
from public.profiles p
where auth.uid() is not null;

revoke all on public.profiles_public from anon;
grant select on public.profiles_public to authenticated;

comment on view public.profiles_public is
  'Other members'' profiles. Owner-rights so it can gate fitness stats on show_fitness_stats_publicly; requires a signed-in caller. Never granted to anon.';

notify pgrst, 'reload schema';
