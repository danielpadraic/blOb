-- Circle visibility + readable Home posts. Same circles table. Not a challenge.

alter table public.circles
  add column if not exists visibility text not null default 'friends';

alter table public.circles drop constraint if exists circles_visibility_allowed;
alter table public.circles
  add constraint circles_visibility_allowed
  check (visibility in ('friends', 'friends_of_friends', 'public'));

create or replace function public.friends_of_friends_accepted(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_a is not null
    and p_b is not null
    and p_a is distinct from p_b
    and (
      public.friends_accepted(p_a, p_b)
      or exists (
        select 1
        from public.friendships near
        join public.friendships far
          on near.status = 'accepted'
         and far.status = 'accepted'
         and (
           (
             near.user_a_id = p_a
             and (
               (far.user_a_id = near.user_b_id and far.user_b_id = p_b)
               or (far.user_b_id = near.user_b_id and far.user_a_id = p_b)
             )
           )
           or (
             near.user_b_id = p_a
             and (
               (far.user_a_id = near.user_a_id and far.user_b_id = p_b)
               or (far.user_b_id = near.user_a_id and far.user_a_id = p_b)
             )
           )
         )
      )
    );
$$;

create or replace function public.friend_of_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.circle_members m
    where m.circle_id = p_circle_id
      and public.friends_accepted(p_user_id, m.user_id)
  );
$$;

create or replace function public.circle_visibility_of(p_circle_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.visibility
  from public.circles c
  where c.id = p_circle_id;
$$;

create or replace function public.can_join_circle(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_circle_id is not null
    and p_user_id is not null
    and not public.is_circle_member(p_circle_id, p_user_id)
    and (
      public.circle_visibility_of(p_circle_id) = 'public'
      or exists (
        select 1
        from public.circle_invites i
        where i.circle_id = p_circle_id
          and i.invitee_id = p_user_id
          and i.status = 'pending'
      )
      or exists (
        select 1
        from public.posts p
        where p.circle_id = p_circle_id
          and p.type = 'circle_invite'
          and p.deleted_at is null
          and public.friends_accepted(p_user_id, p.author_id)
      )
      or (
        public.circle_visibility_of(p_circle_id) = 'friends_of_friends'
        and public.friend_of_circle_member(p_circle_id, p_user_id)
      )
    );
$$;

create or replace function public.can_read_circle_post(
  p_circle_id uuid,
  p_type text,
  p_author_id uuid,
  p_audience text
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
      p_circle_id is not null
      and auth.uid() is not null
      and (
        (
          p_type = 'circle_invite'
          and p_audience = 'friends'
          and public.friends_accepted(auth.uid(), p_author_id)
        )
        or (
          coalesce(p_type, '') is distinct from 'circle_invite'
          and (
            public.is_circle_member(p_circle_id, auth.uid())
            or public.circle_visibility_of(p_circle_id) = 'public'
            or (
              public.circle_visibility_of(p_circle_id) = 'friends_of_friends'
              and public.friends_of_friends_accepted(auth.uid(), p_author_id)
            )
          )
        )
      )
    );
$$;

create or replace function public.create_circle(
  p_name text,
  p_focus text,
  p_description text default null,
  p_banner_url text default null,
  p_visibility text default 'friends'
)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.circles;
  v_name text := btrim(coalesce(p_name, ''));
  v_focus text := btrim(coalesce(p_focus, ''));
  v_visibility text := coalesce(nullif(btrim(p_visibility), ''), 'friends');
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if v_name = '' then
    raise exception 'Give the Circle a name.';
  end if;
  if v_focus = '' then
    raise exception 'Say what this Circle is for.';
  end if;
  if v_visibility not in ('friends', 'friends_of_friends', 'public') then
    v_visibility := 'friends';
  end if;

  insert into public.circles (created_by, name, focus, description, banner_url, visibility)
  values (
    auth.uid(),
    v_name,
    v_focus,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_banner_url, '')), ''),
    v_visibility
  )
  returning * into v_row;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_row.id, auth.uid(), 'host');

  return v_row;
end;
$$;

drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone"
  on public.comments for select
  using (
    not exists (select 1 from public.posts p where p.id = comments.post_id and p.circle_id is not null)
    or public.can_read_circle_post(
      (select p.circle_id from public.posts p where p.id = comments.post_id),
      (select p.type from public.posts p where p.id = comments.post_id),
      (select p.author_id from public.posts p where p.id = comments.post_id),
      (select p.audience from public.posts p where p.id = comments.post_id)
    )
  );

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
  on public.comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      not exists (select 1 from public.posts p where p.id = post_id and p.circle_id is not null)
      or public.can_read_circle_post(
        (select p.circle_id from public.posts p where p.id = post_id),
        (select p.type from public.posts p where p.id = post_id),
        (select p.author_id from public.posts p where p.id = post_id),
        (select p.audience from public.posts p where p.id = post_id)
      )
    )
  );

drop policy if exists "Reactions are viewable by everyone" on public.reactions;
create policy "Reactions are viewable by everyone"
  on public.reactions for select
  using (
    (
      post_id is not null
      and (
        not exists (select 1 from public.posts p where p.id = reactions.post_id and p.circle_id is not null)
        or public.can_read_circle_post(
          (select p.circle_id from public.posts p where p.id = reactions.post_id),
          (select p.type from public.posts p where p.id = reactions.post_id),
          (select p.author_id from public.posts p where p.id = reactions.post_id),
          (select p.audience from public.posts p where p.id = reactions.post_id)
        )
      )
    )
    or (
      comment_id is not null
      and (
        not exists (
          select 1 from public.comments c
          join public.posts p on p.id = c.post_id
          where c.id = reactions.comment_id and p.circle_id is not null
        )
        or public.can_read_circle_post(
          (
            select p.circle_id
            from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = reactions.comment_id
          ),
          (
            select p.type
            from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = reactions.comment_id
          ),
          (
            select p.author_id
            from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = reactions.comment_id
          ),
          (
            select p.audience
            from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = reactions.comment_id
          )
        )
      )
    )
  );

drop policy if exists "Authenticated users can create reactions" on public.reactions;
create policy "Authenticated users can create reactions"
  on public.reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      (
        post_id is not null
        and (
          not exists (select 1 from public.posts p where p.id = post_id and p.circle_id is not null)
          or public.can_read_circle_post(
            (select p.circle_id from public.posts p where p.id = post_id),
            (select p.type from public.posts p where p.id = post_id),
            (select p.author_id from public.posts p where p.id = post_id),
            (select p.audience from public.posts p where p.id = post_id)
          )
        )
      )
      or (
        comment_id is not null
        and (
          not exists (
            select 1 from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = comment_id and p.circle_id is not null
          )
          or public.can_read_circle_post(
            (
              select p.circle_id
              from public.comments c
              join public.posts p on p.id = c.post_id
              where c.id = comment_id
            ),
            (
              select p.type
              from public.comments c
              join public.posts p on p.id = c.post_id
              where c.id = comment_id
            ),
            (
              select p.author_id
              from public.comments c
              join public.posts p on p.id = c.post_id
              where c.id = comment_id
            ),
            (
              select p.audience
              from public.comments c
              join public.posts p on p.id = c.post_id
              where c.id = comment_id
            )
          )
        )
      )
    )
  );

alter table public.post_mentions
  alter column mentioned_user_id drop not null;
alter table public.post_mentions
  add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;
alter table public.post_mentions
  add column if not exists circle_id uuid references public.circles(id) on delete cascade;

alter table public.post_mentions drop constraint if exists post_mentions_post_id_mentioned_user_id_key;
create unique index if not exists post_mentions_user_pair_idx
  on public.post_mentions (post_id, mentioned_user_id)
  where mentioned_user_id is not null;
create unique index if not exists post_mentions_challenge_pair_idx
  on public.post_mentions (post_id, challenge_id)
  where challenge_id is not null;
create unique index if not exists post_mentions_circle_pair_idx
  on public.post_mentions (post_id, circle_id)
  where circle_id is not null;

do $$
begin
  if to_regclass('public.comment_mentions') is null then
    return;
  end if;
  alter table public.comment_mentions alter column mentioned_user_id drop not null;
  alter table public.comment_mentions
    add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;
  alter table public.comment_mentions
    add column if not exists circle_id uuid references public.circles(id) on delete cascade;
  alter table public.comment_mentions drop constraint if exists comment_mentions_comment_id_mentioned_user_id_key;
  create unique index if not exists comment_mentions_user_pair_idx
    on public.comment_mentions (comment_id, mentioned_user_id)
    where mentioned_user_id is not null;
  create unique index if not exists comment_mentions_challenge_pair_idx
    on public.comment_mentions (comment_id, challenge_id)
    where challenge_id is not null;
  create unique index if not exists comment_mentions_circle_pair_idx
    on public.comment_mentions (comment_id, circle_id)
    where circle_id is not null;
end $$;

revoke all on function public.friends_of_friends_accepted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.friend_of_circle_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.circle_visibility_of(uuid) from public, anon, authenticated;
revoke all on function public.create_circle(text, text, text, text, text) from public, anon;
grant execute on function public.create_circle(text, text, text, text, text) to authenticated;
grant execute on function public.can_join_circle(uuid, uuid) to authenticated;
