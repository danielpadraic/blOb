alter table public.posts drop constraint if exists posts_audience_check;
alter table public.posts
  add constraint posts_audience_check
  check (audience in ('public', 'friends', 'specific', 'people', 'only_me', 'challenge_only'));

create or replace function public.content_audience_for_privacy_mode(p_mode text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_mode, '')) = 'private_corporate' then 'challenge_only'
    when lower(coalesce(p_mode, '')) = 'private' then 'friends'
    else 'public'
  end;
$$;

create or replace function public.challenge_is_private_corporate(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenges c
    where c.id = p_challenge_id
      and c.privacy_mode = 'private_corporate'
  );
$$;

create or replace function public.user_is_corporate_room_reader(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  if p_challenge_id is null or p_user_id is null then
    return false;
  end if;
  if public.is_official_ops() then
    return true;
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return false;
  end if;
  if v_c.created_by is not distinct from p_user_id then
    return true;
  end if;
  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;
  if exists (
    select 1 from public.challenge_moderators
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.user_can_select_corporate_challenge(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.user_is_corporate_room_reader(p_challenge_id, p_user_id) then
    return true;
  end if;
  if p_user_id is null or p_challenge_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.challenge_invites i
    where i.challenge_id = p_challenge_id
      and i.invitee_id = p_user_id
      and i.status in ('pending', 'accepted')
  );
end;
$$;

revoke all on function public.content_audience_for_privacy_mode(text) from public;
grant execute on function public.content_audience_for_privacy_mode(text) to anon, authenticated;

revoke all on function public.challenge_is_private_corporate(uuid) from public;
grant execute on function public.challenge_is_private_corporate(uuid) to anon, authenticated;

revoke all on function public.user_is_corporate_room_reader(uuid, uuid) from public;
grant execute on function public.user_is_corporate_room_reader(uuid, uuid) to anon, authenticated;

revoke all on function public.user_can_select_corporate_challenge(uuid, uuid) from public;
grant execute on function public.user_can_select_corporate_challenge(uuid, uuid) to anon, authenticated;

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
    public.is_official_ops()
    or auth.uid() is not distinct from p_author_id
    or (
      not public.friendship_is_blocked(auth.uid(), p_author_id)
      and p_audience is distinct from 'only_me'
      and (
        case
          when public.challenge_is_private_corporate(p_challenge_id) then
            public.user_is_corporate_room_reader(p_challenge_id, auth.uid())
          else
            (
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
              or (
                p_challenge_id is not null
                and auth.uid() is not null
                and public.is_callout_challenge_observer(p_challenge_id, auth.uid())
              )
            )
        end
      )
    );
$$;

create or replace function public.announce_challenge_join(p_challenge_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_name text;
  v_title text;
  v_audience text;
  v_lobby_audience text;
begin
  if p_challenge_id is null or p_user_id is null then
    return;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;

  v_name := coalesce(nullif(public.profile_display_name(p_user_id), ''), 'Someone');
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'a challenge');
  v_lobby_audience := public.content_audience_for_privacy_mode(v_c.privacy_mode);

  if not exists (
    select 1
    from public.posts
    where author_id = p_user_id
      and challenge_id = p_challenge_id
      and system_kind = 'join_challenge_feed'
  ) then
    insert into public.posts (
      author_id,
      challenge_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      system_kind
    ) values (
      p_user_id,
      p_challenge_id,
      v_name || ' has joined the challenge!',
      '{}',
      v_lobby_audience,
      '{}',
      'challenge',
      'join_challenge_feed'
    );
  end if;

  if not public.challenge_allows_main_feed_announce(v_c) then
    return;
  end if;

  v_audience := case
    when lower(coalesce(v_c.visibility, '')) = 'friends' then 'friends'
    else 'public'
  end;

  if not exists (
    select 1
    from public.posts
    where author_id = p_user_id
      and challenge_id = p_challenge_id
      and system_kind = 'join_main_feed'
  ) then
    insert into public.posts (
      author_id,
      challenge_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      system_kind
    ) values (
      p_user_id,
      p_challenge_id,
      v_name || ' joined ' || v_title,
      '{}',
      v_audience,
      '{}',
      'feed',
      'join_main_feed'
    );
  end if;
exception when others then
  null;
end;
$$;

create or replace function public.post_checkin_stage(
  p_user_id uuid,
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_content text,
  p_media text[],
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_media text[] := '{}';
  v_existing text[] := '{}';
  v_stats jsonb;
  v_card text;
  v_audience text;
begin
  select id, media_urls
    into v_id, v_existing
  from public.posts
  where checkin_id = p_checkin_id
    and deleted_at is null
  order by created_at asc, id asc
  limit 1;

  v_stats := public.checkin_fitness_stats(p_checkin_id);
  v_card := nullif(btrim(coalesce(v_stats->>'card_url', '')), '');
  v_media := public.checkin_media_stills_then_recap(
    coalesce(v_existing, '{}') || coalesce(p_media, '{}'),
    v_card
  );
  v_audience := public.content_audience_for_privacy_mode(
    (select c.privacy_mode from public.challenges c where c.id = p_challenge_id)
  );

  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(v_media, 1), 0) = 0 then
    return;
  end if;

  if v_id is not null then
    update public.posts
    set
      content = coalesce(nullif(btrim(p_content), ''), content),
      media_urls = v_media,
      checkin_stage = p_stage,
      source = 'checkin',
      challenge_id = coalesce(challenge_id, p_challenge_id),
      checkin_stats = coalesce(v_stats, checkin_stats),
      audience = case
        when public.challenge_is_private_corporate(p_challenge_id) then v_audience
        else audience
      end
    where id = v_id;
    return;
  end if;

  insert into public.posts (
    author_id,
    challenge_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    checkin_id,
    checkin_stage,
    source,
    checkin_stats
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    v_media,
    v_audience,
    '{}',
    p_checkin_id,
    p_stage,
    'checkin',
    v_stats
  );
end;
$$;

update public.posts p
set audience = 'challenge_only'
from public.challenges c
where p.challenge_id = c.id
  and c.privacy_mode = 'private_corporate'
  and p.audience is distinct from 'challenge_only';

drop policy if exists "Challenges are viewable by everyone" on public.challenges;
create policy "Challenges are viewable by everyone"
  on public.challenges
  for select
  using (
    privacy_mode is distinct from 'private_corporate'
    or public.user_can_select_corporate_challenge(id, auth.uid())
  );

drop policy if exists "Users can read challenges" on public.challenges;
create policy "Users can read challenges"
  on public.challenges
  for select
  to authenticated
  using (
    (
      visibility = 'public'
      or visibility is null
      or created_by = auth.uid()
      or is_official = true
    )
    and (
      privacy_mode is distinct from 'private_corporate'
      or public.user_can_select_corporate_challenge(id, auth.uid())
    )
  );

drop policy if exists "Participants are viewable by everyone" on public.challenge_participants;
create policy "Participants are viewable by everyone"
  on public.challenge_participants
  for select
  using (
    not public.challenge_is_private_corporate(challenge_id)
    or public.user_can_select_corporate_challenge(challenge_id, auth.uid())
  );

drop policy if exists "Corporate staff read checkins" on public.challenge_checkins;
create policy "Corporate staff read checkins"
  on public.challenge_checkins
  for select
  to authenticated
  using (
    public.challenge_is_private_corporate(challenge_id)
    and public.user_is_corporate_room_reader(challenge_id, auth.uid())
  );

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts
  for insert
  to authenticated
  with check (
    (auth.uid() = author_id)
    and ((circle_id is null) or is_circle_member(circle_id, auth.uid()))
    and (
      challenge_id is null
      or (
        case
          when public.challenge_is_private_corporate(challenge_id)
            then public.user_is_corporate_room_reader(challenge_id, auth.uid())
          else public.user_can_access_challenge(challenge_id, auth.uid())
        end
      )
    )
    and (
      (challenge_id is null)
      or (circle_id is null)
      or ((type = 'circle_challenge_share') and user_can_access_challenge(challenge_id, auth.uid()))
    )
    and (
      (wall_host_id is null)
      or (wall_host_id = auth.uid())
      or can_post_on_profile(wall_host_id)
    )
  );

create or replace function public.accept_challenge_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.challenge_invites%rowtype;
  v_host uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_inv from challenge_invites where token = p_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.status = 'revoked' then raise exception 'INVITE_REVOKED'; end if;

  select created_by into v_host from public.challenges where id = v_inv.challenge_id;
  if public.friendship_is_blocked(v_uid, v_host) then
    raise exception 'This invite isn’t available.' using errcode = 'P0001';
  end if;

  update challenge_invites
  set status = 'accepted',
      invitee_id = coalesce(invitee_id, v_uid),
      accepted_at = now()
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_inv.challenge_id,
    'invite_id', v_inv.id
  );
end;
$$;

