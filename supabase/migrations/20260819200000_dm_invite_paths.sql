-- DM + challenge invite paths. Safe to re-run.
-- Message: find/create thread with accepted friends. Invite: write challenge_invites + bell; do not join.

create unique index if not exists challenge_invites_challenge_invitee_uidx
  on public.challenge_invites (challenge_id, invitee_id)
  where invitee_id is not null;

create or replace function public.are_accepted_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null
    and p_b is not null
    and p_a is distinct from p_b
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.user_a_id = p_a and f.user_b_id = p_b)
          or (f.user_b_id = p_a and f.user_a_id = p_b)
        )
    );
$$;

grant execute on function public.are_accepted_friends(uuid, uuid) to authenticated;

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row public.conversations;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'You can’t message yourself.';
  end if;
  if not public.are_accepted_friends(v_me, p_other_user_id) then
    raise exception 'You can only message accepted friends.';
  end if;

  select c.*
    into v_row
  from public.conversations c
  join public.conversation_members a
    on a.conversation_id = c.id and a.user_id = v_me
  join public.conversation_members b
    on b.conversation_id = c.id and b.user_id = p_other_user_id
  where c.is_group = false
  order by c.created_at
  limit 1;

  if found then
    return v_row;
  end if;

  insert into public.conversations (is_group, challenge_id)
  values (false, null)
  returning * into v_row;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_row.id, v_me), (v_row.id, p_other_user_id);

  return v_row;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.invite_to_challenge(p_challenge_id uuid, p_invitee_id uuid)
returns public.challenge_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_challenge public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
  v_official_fill boolean;
  v_name text;
begin
  v_inviter := auth.uid();
  if v_inviter is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_invitee_id is null then
    raise exception 'Pick someone to invite' using errcode = 'P0001';
  end if;

  if p_invitee_id = v_inviter then
    raise exception 'You can’t invite yourself' using errcode = 'P0001';
  end if;

  if not public.are_accepted_friends(v_inviter, p_invitee_id) then
    raise exception 'Add a friend first' using errcode = 'P0001';
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  v_official_fill :=
    coalesce(v_challenge.is_official, false)
    and coalesce(v_challenge.status, '') in ('filling', 'arming');

  if v_challenge.created_by is distinct from v_inviter and not v_official_fill then
    raise exception 'Only the host can invite people' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = p_invitee_id
  ) then
    raise exception 'They’re already in this challenge' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.challenge_invites
  where challenge_id = p_challenge_id
    and invitee_id = p_invitee_id
  limit 1;

  if found then
    raise exception 'You already invited them' using errcode = 'P0001';
  end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id)
  values (p_challenge_id, v_inviter, p_invitee_id)
  returning * into v_invite;

  -- Do not auto-join. Official filling still requires the $1 buy-in.
  v_name := public.profile_display_name(v_inviter);
  begin
    perform public.notify_user(
      p_invitee_id,
      v_inviter,
      'challenge_invite',
      v_name || ' invited you to ' || coalesce(v_challenge.title, 'this challenge') || '.',
      null,
      jsonb_build_object('challenge_id', p_challenge_id)
    );
  exception when others then
    raise warning 'invite notify failed: %', sqlerrm;
  end;

  return v_invite;
end;
$$;

grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

create or replace function public.trg_notify_challenge_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
begin
  if new.invitee_id is null then
    return new;
  end if;
  -- RPC already notifies targeted invites; skip a duplicate bell.
  if exists (
    select 1
    from public.notifications n
    where n.user_id = new.invitee_id
      and n.type = 'challenge_invite'
      and n.created_at > now() - interval '5 seconds'
      and coalesce(n.data->>'challenge_id', '') = new.challenge_id::text
  ) then
    return new;
  end if;
  v_name := public.profile_display_name(new.inviter_id);
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.invitee_id,
    new.inviter_id,
    'challenge_invite',
    v_name || ' invited you to ' || coalesce(v_title, 'this challenge') || '.',
    null,
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  raise warning 'challenge invite trigger notify failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists challenge_invites_notify on public.challenge_invites;
create trigger challenge_invites_notify
  after insert on public.challenge_invites
  for each row execute function public.trg_notify_challenge_invite();

create or replace function public.trg_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_preview text;
begin
  v_name := public.profile_display_name(new.sender_id);
  v_preview := nullif(left(btrim(coalesce(new.body, '')), 80), '');
  for rec in
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id is distinct from new.sender_id
  loop
    perform public.notify_user(
      rec.user_id,
      new.sender_id,
      'message',
      v_name || ' sent you a message.',
      v_preview,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'href', '/messages/' || new.conversation_id::text
      )
    );
  end loop;
  return new;
exception when others then
  raise warning 'message notify failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists messages_notify_members on public.messages;
create trigger messages_notify_members
  after insert on public.messages
  for each row execute function public.trg_notify_message();

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
  null;
when others then
  null;
end $$;
