-- Post audience + stricter profile privacy.
-- Existing posts stay public so old check-ins remain visible on public profiles.

alter table public.posts
  add column if not exists audience text not null default 'public',
  add column if not exists audience_user_ids uuid[] not null default '{}';

alter table public.posts drop constraint if exists posts_audience_check;
alter table public.posts
  add constraint posts_audience_check
  check (audience in ('public', 'friends', 'specific'));

alter table public.posts drop constraint if exists posts_audience_specific_ids;
alter table public.posts
  add constraint posts_audience_specific_ids
  check (audience <> 'specific' or coalesce(array_length(audience_user_ids, 1), 0) > 0);

comment on column public.posts.audience is
  'public = anyone; friends = accepted friends; specific = audience_user_ids only. Author always reads own posts.';

create index if not exists posts_audience_idx on public.posts (audience);
create index if not exists posts_audience_user_ids_idx on public.posts using gin (audience_user_ids);

create or replace function public.can_read_post(
  p_author_id uuid,
  p_audience text,
  p_audience_user_ids uuid[],
  p_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not distinct from p_author_id
    or p_audience = 'public'
    or (
      p_audience = 'friends'
      and auth.uid() is not null
      and exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and f.user_a_id = least(auth.uid(), p_author_id)
          and f.user_b_id = greatest(auth.uid(), p_author_id)
      )
    )
    or (
      p_audience = 'specific'
      and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
    )
    or (
      p_challenge_id is not null
      and public.is_challenge_participant(p_challenge_id, auth.uid())
    );
$$;

create or replace function public.can_read_post_id(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and public.can_read_post(p.author_id, p.audience, p.audience_user_ids, p.challenge_id)
  );
$$;

grant execute on function public.can_read_post(uuid, text, uuid[], uuid) to anon, authenticated;
grant execute on function public.can_read_post_id(uuid) to anon, authenticated;

drop policy if exists "Posts are readable" on public.posts;
create policy "Posts are readable"
  on public.posts for select
  using (
    public.can_read_post(author_id, audience, audience_user_ids, challenge_id)
  );

drop policy if exists "Authors can delete their posts" on public.posts;

revoke delete on public.posts from authenticated;
grant select on public.posts to anon, authenticated;
grant insert on public.posts to authenticated;

drop policy if exists "Comments are readable" on public.comments;
create policy "Comments are readable"
  on public.comments for select
  using (public.can_read_post_id(post_id));

drop policy if exists "Authenticated users can comment" on public.comments;
create policy "Authenticated users can comment"
  on public.comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and public.can_read_post_id(post_id)
  );

drop policy if exists "Reactions are readable" on public.reactions;
create policy "Reactions are readable"
  on public.reactions for select
  using (
    (post_id is not null and public.can_read_post_id(post_id))
    or (
      comment_id is not null
      and exists (
        select 1
        from public.comments c
        where c.id = comment_id
          and public.can_read_post_id(c.post_id)
      )
    )
  );

drop policy if exists "Authenticated users can react" on public.reactions;
create policy "Authenticated users can react"
  on public.reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      (post_id is not null and public.can_read_post_id(post_id))
      or (
        comment_id is not null
        and exists (
          select 1
          from public.comments c
          where c.id = comment_id
            and public.can_read_post_id(c.post_id)
        )
      )
    )
  );

-- Body metrics stay owner-private. Public projection never returns them.
create or replace view public.profiles_public
with (security_invoker = true) as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.skill_tags,
  p.primary_activities,
  false as show_fitness_stats_publicly,
  p.created_at,
  null::numeric as height_cm,
  null::numeric as current_weight,
  null::numeric as goal_weight,
  null::text as weight_unit,
  null::integer as typical_weekly_workout_frequency
from public.profiles p;

comment on view public.profiles_public is
  'Public profile projection. Body metrics and training measurements are never included.';

revoke select (
  height_cm, current_weight, goal_weight, weight_unit, typical_weekly_workout_frequency
) on public.profiles from anon, authenticated;

grant select (
  id, username, display_name, avatar_url, bio,
  primary_activities, skill_tags,
  show_fitness_stats_publicly, created_at, updated_at
) on public.profiles to anon, authenticated;
