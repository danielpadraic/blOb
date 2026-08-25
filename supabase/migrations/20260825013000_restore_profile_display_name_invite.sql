-- Invite RPC calls profile_display_name after insert. That helper was missing
-- on live (42883), so host invites rolled back with a generic client error.

create or replace function public.profile_display_name(p_user_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(trim(p.display_name), ''), p.username, 'Someone')
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.profile_display_name(uuid) to authenticated, anon, service_role;

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

  -- Hosts may invite on public, private, and private_corporate challenges.
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

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
  values (p_challenge_id, v_inviter, p_invitee_id, 'pending')
  returning * into v_invite;

  begin
    v_name := coalesce(public.profile_display_name(v_inviter), 'Someone');
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

create or replace function public.create_group_conversation(p_member_ids uuid[])
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_other uuid;
  v_row public.conversations;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select array_agg(distinct id order by id)
    into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as id
  where id is not null and id is distinct from v_me;

  if v_ids is null or coalesce(cardinality(v_ids), 0) < 2 then
    raise exception 'Pick at least two friends for a group.' using errcode = 'P0001';
  end if;

  foreach v_other in array v_ids loop
    if not public.are_accepted_friends(v_me, v_other) then
      raise exception 'You can only message accepted friends.' using errcode = 'P0001';
    end if;
  end loop;

  select c.*
    into v_row
  from public.conversations c
  where c.is_group = true
    and (
      select count(*) from public.conversation_members m where m.conversation_id = c.id
    ) = cardinality(v_ids) + 1
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = v_me
    )
    and not exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id
        and m.user_id is distinct from v_me
        and m.user_id <> all (v_ids)
    )
  order by c.created_at
  limit 1;

  if found then
    return v_row;
  end if;

  insert into public.conversations (is_group, challenge_id)
  values (true, null)
  returning * into v_row;

  insert into public.conversation_members (conversation_id, user_id)
  select v_row.id, v_me
  union
  select v_row.id, id from unnest(v_ids) as id;

  return v_row;
end;
$$;

grant execute on function public.create_group_conversation(uuid[]) to authenticated;

notify pgrst, 'reload schema';
