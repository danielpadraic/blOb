-- Friend request / accept notifications (reliable payload + copy) and
-- friend_challenge alerts when an accepted friend creates a challenge.

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
exception when others then
  null;
end $$;

do $$
begin
  alter table public.notifications add constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'mentioned',
    'profile_wall',
    'challenge_joined',
    'challenge_join_confirmed',
    'follow',
    'friend_request',
    'friend_accepted',
    'friend_challenge',
    'post_comment',
    'post_reaction',
    'post_reposted',
    'story_reaction',
    'story_comment',
    'story_shared',
    'coins_received',
    'coin_grant',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated',
    'challenge_starting',
    'challenge_checkin_reminder',
    'challenge_checkin',
    'competitor_dropped',
    'challenge_won',
    'challenge_lost',
    'payout_received',
    'profile_incomplete',
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
    'badge_unlocked',
    'challenge_cancelled',
    'message',
    'official_started',
    'proof_flagged',
    'start_rolled',
    'bob_encouragement'
  ));
exception when others then
  alter table public.notifications drop constraint if exists notifications_type_known;
end $$;

create or replace function public.friendship_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'blocked'
      and f.user_a_id = least(p_a, p_b)
      and f.user_b_id = greatest(p_a, p_b)
  );
$$;

create or replace function public.emit_friend_request_notification(p_sender uuid, p_recipient uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_name text;
begin
  if p_sender is null or p_recipient is null or p_sender = p_recipient then
    return;
  end if;
  if public.friendship_is_blocked(p_sender, p_recipient) then
    return;
  end if;

  select username into v_username from public.profiles where id = p_sender;
  v_name := coalesce(nullif(public.profile_display_name(p_sender), ''), coalesce(v_username, 'Someone'));

  perform public.notify_user(
    p_recipient,
    p_sender,
    'friend_request',
    v_name || ' sent you a friend request.',
    null,
    jsonb_build_object(
      'actor_id', p_sender,
      'from_user_id', p_sender,
      'username', v_username,
      'href', '/friends?segment=requests',
      'dedupe_key', 'friend_request:' || least(p_sender, p_recipient)::text || ':' || greatest(p_sender, p_recipient)::text
    )
  );
end;
$$;

create or replace function public.emit_friend_accepted_notification(p_accepter uuid, p_sender uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_name text;
begin
  if p_accepter is null or p_sender is null or p_accepter = p_sender then
    return;
  end if;
  if public.friendship_is_blocked(p_accepter, p_sender) then
    return;
  end if;

  select username into v_username from public.profiles where id = p_accepter;
  v_name := coalesce(nullif(public.profile_display_name(p_accepter), ''), coalesce(v_username, 'Someone'));

  perform public.notify_user(
    p_sender,
    p_accepter,
    'friend_accepted',
    v_name || ' accepted your friend request.',
    null,
    jsonb_build_object(
      'actor_id', p_accepter,
      'username', v_username,
      'href', case
        when v_username is not null then '/friends/u/' || v_username
        else '/friends'
      end,
      'dedupe_key', 'friend_accepted:' || least(p_accepter, p_sender)::text || ':' || greatest(p_accepter, p_sender)::text
    )
  );
end;
$$;

create or replace function public.trg_notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  -- Auto-accepted inserts (official Bob friendship) must not notify.
  if tg_op = 'INSERT' and new.status = 'accepted' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' and new.requested_by is not null then
    v_other := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    perform public.emit_friend_request_notification(new.requested_by, v_other);
  elsif tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'accepted'
     and new.requested_by is not null then
    v_other := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    perform public.emit_friend_accepted_notification(v_other, new.requested_by);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert or update of status on public.friendships
  for each row execute function public.trg_notify_friendship();

create or replace function public.ensure_friend_request_notification(p_to_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_to_user_id is null then
    return;
  end if;
  if not exists (
    select 1
    from public.friendships f
    where f.user_a_id = least(v_me, p_to_user_id)
      and f.user_b_id = greatest(v_me, p_to_user_id)
      and f.status = 'pending'
      and f.requested_by = v_me
  ) then
    return;
  end if;
  perform public.emit_friend_request_notification(v_me, p_to_user_id);
end;
$$;

create or replace function public.notify_one_friend_of_challenge(p_challenge_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_username text;
  v_name text;
  v_body text;
begin
  if p_challenge_id is null or p_friend_id is null then
    return;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  if coalesce(v_c.is_official, false) then
    return;
  end if;
  if v_c.created_by is null or v_c.created_by = p_friend_id then
    return;
  end if;
  if v_c.status in ('cancelled', 'cancelled_underfilled') then
    return;
  end if;
  if public.friendship_is_blocked(v_c.created_by, p_friend_id) then
    return;
  end if;
  if not public.are_accepted_friends(v_c.created_by, p_friend_id) then
    return;
  end if;
  if not public.user_can_access_challenge(p_challenge_id, p_friend_id) then
    return;
  end if;

  select username into v_username from public.profiles where id = v_c.created_by;
  v_name := coalesce(nullif(public.profile_display_name(v_c.created_by), ''), coalesce(v_username, 'Someone'));
  v_body := nullif(btrim(coalesce(v_c.title, '')), '');

  perform public.notify_user(
    p_friend_id,
    v_c.created_by,
    'friend_challenge',
    v_name || ' created a challenge',
    v_body,
    jsonb_build_object(
      'challenge_id', v_c.id,
      'actor_id', v_c.created_by,
      'username', v_username,
      'dedupe_key', 'friend_challenge:' || v_c.id::text || ':' || p_friend_id::text
    )
  );
end;
$$;

create or replace function public.notify_friends_of_new_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_friend uuid;
begin
  if p_challenge_id is null then
    return;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  if coalesce(v_c.is_official, false) or v_c.created_by is null then
    return;
  end if;
  if auth.uid() is not null and auth.uid() is distinct from v_c.created_by then
    return;
  end if;

  for v_friend in
    select case
      when f.user_a_id = v_c.created_by then f.user_b_id
      else f.user_a_id
    end
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a_id = v_c.created_by or f.user_b_id = v_c.created_by)
  loop
    perform public.notify_one_friend_of_challenge(p_challenge_id, v_friend);
  end loop;
exception when others then
  null;
end;
$$;

create or replace function public.trg_notify_friend_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_friends_of_new_challenge(new.id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenges_notify_friend_challenge on public.challenges;
create trigger challenges_notify_friend_challenge
  after insert on public.challenges
  for each row execute function public.trg_notify_friend_challenge();

create or replace function public.trg_notify_friend_challenge_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  if new.invitee_id is null then
    return new;
  end if;
  select created_by into v_host from public.challenges where id = new.challenge_id;
  if v_host is null then
    return new;
  end if;
  if not public.are_accepted_friends(v_host, new.invitee_id) then
    return new;
  end if;
  perform public.notify_one_friend_of_challenge(new.challenge_id, new.invitee_id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_invites_notify_friend_challenge on public.challenge_invites;
create trigger challenge_invites_notify_friend_challenge
  after insert on public.challenge_invites
  for each row execute function public.trg_notify_friend_challenge_invite();

revoke all on function public.friendship_is_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.emit_friend_request_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.emit_friend_accepted_notification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_one_friend_of_challenge(uuid, uuid) from public, anon, authenticated;
revoke all on function public.trg_notify_friendship() from public, anon, authenticated;
revoke all on function public.trg_notify_friend_challenge() from public, anon, authenticated;
revoke all on function public.trg_notify_friend_challenge_invite() from public, anon, authenticated;

grant execute on function public.ensure_friend_request_notification(uuid) to authenticated;
grant execute on function public.notify_friends_of_new_challenge(uuid) to authenticated;
grant execute on function public.are_accepted_friends(uuid, uuid) to authenticated, anon;

notify pgrst, 'reload schema';
