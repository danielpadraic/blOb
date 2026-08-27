-- Profile wall, cover, Only me, and challenge showcase visibility.
-- Wall posts already use wall_host_id. Do not add a second wall column.
-- Live audience historically includes 'people' (same as specific). Keep it valid.

alter table public.profiles
  add column if not exists cover_url text;

alter table public.posts drop constraint if exists posts_audience_check;
alter table public.posts
  add constraint posts_audience_check
  check (audience in ('public', 'friends', 'specific', 'people', 'only_me'));

comment on column public.posts.audience is
  'public = anyone; friends = accepted friends; specific/people = audience_user_ids; only_me = author.';

alter table public.posts drop constraint if exists posts_source_allowed;
alter table public.posts
  add constraint posts_source_allowed
  check (source in ('challenge', 'checkin', 'feed', 'share', 'profile_photo'));

alter table public.challenge_participants
  add column if not exists profile_visibility text not null default 'friends';

alter table public.challenge_participants drop constraint if exists challenge_participants_profile_visibility_check;
alter table public.challenge_participants
  add constraint challenge_participants_profile_visibility_check
  check (profile_visibility in ('public', 'friends', 'only_me'));

alter table public.challenges
  add column if not exists profile_visibility text not null default 'friends';

alter table public.challenges drop constraint if exists challenges_profile_visibility_check;
alter table public.challenges
  add constraint challenges_profile_visibility_check
  check (profile_visibility in ('public', 'friends', 'only_me'));

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
    or (
      p_audience is distinct from 'only_me'
      and (
        p_audience = 'public'
        or exists (
          select 1
          from public.profiles pr
          where pr.id = p_author_id
            and coalesce(pr.is_official, false)
        )
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
          p_audience in ('specific', 'people')
          and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and exists (
            select 1
            from public.challenge_participants cp
            where cp.challenge_id = p_challenge_id
              and cp.user_id = auth.uid()
          )
        )
      )
    );
$$;

create or replace function public.can_post_on_profile(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_host_id is not null
    and auth.uid() is distinct from p_host_id
    and not public.friendship_is_blocked(auth.uid(), p_host_id)
    and exists (
      select 1
      from public.profiles host
      where host.id = p_host_id
        and coalesce(host.allow_profile_posts, true)
        and coalesce(host.is_official, false) = false
        and lower(coalesce(host.username, '')) is distinct from 'blob'
        and (
          coalesce(host.profile_visibility, 'public') = 'public'
          or (
            coalesce(host.profile_visibility, 'public') = 'friends'
            and exists (
              select 1
              from public.friendships f
              where f.status = 'accepted'
                and f.user_a_id = least(auth.uid(), p_host_id)
                and f.user_b_id = greatest(auth.uid(), p_host_id)
            )
          )
        )
    );
$$;

drop policy if exists "Posts are viewable by everyone" on public.posts;
drop policy if exists "Posts are readable" on public.posts;
create policy "Posts are readable"
  on public.posts for select
  using (
    deleted_at is null
    and (
      public.can_read_post(author_id, audience, audience_user_ids, challenge_id)
      or (
        wall_host_id is not distinct from auth.uid()
        and wall_removed_at is null
        and audience is distinct from 'only_me'
        and not public.friendship_is_blocked(author_id, auth.uid())
      )
    )
  );

create or replace function public.set_participation_profile_visibility(
  p_challenge_id uuid,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visibility not in ('public', 'friends', 'only_me') then
    raise exception 'Invalid profile visibility';
  end if;
  update public.challenge_participants
  set profile_visibility = p_visibility
  where challenge_id = p_challenge_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.set_challenge_profile_visibility(
  p_challenge_id uuid,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visibility not in ('public', 'friends', 'only_me') then
    raise exception 'Invalid profile visibility';
  end if;
  update public.challenges
  set profile_visibility = p_visibility
  where id = p_challenge_id
    and created_by = auth.uid();
end;
$$;

grant execute on function public.can_read_post(uuid, text, uuid[], uuid) to anon, authenticated;
grant execute on function public.can_post_on_profile(uuid) to authenticated;
grant execute on function public.set_participation_profile_visibility(uuid, text) to authenticated;
grant execute on function public.set_challenge_profile_visibility(uuid, text) to authenticated;
