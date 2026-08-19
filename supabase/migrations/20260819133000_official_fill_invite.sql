-- Official filling: any signed-in user can invite a friend (not host-only).
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

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id)
  values (p_challenge_id, v_inviter, p_invitee_id)
  on conflict (challenge_id, invitee_id) do nothing
  returning * into v_invite;

  if v_invite.id is null then
    select * into v_invite
    from public.challenge_invites
    where challenge_id = p_challenge_id
      and invitee_id = p_invitee_id;
    raise exception 'You already invited them' using errcode = 'P0001';
  end if;

  return v_invite;
end;
$$;

grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;
