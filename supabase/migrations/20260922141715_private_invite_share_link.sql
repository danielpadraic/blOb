-- Private / private_corporate Copy link: one reusable open token per
-- challenge + sharer. Opening ?invite= claims a personal accepted row
-- (card + Join). It does not join, does not consume the shared token,
-- and does not post to Home. Do not touch TEST 8fce711b.

create or replace function public.mint_challenge_invite_link(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
  v_status text;
begin
  if v_uid is null or p_challenge_id is null then
    raise exception 'Couldn’t copy that invite.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'Couldn’t copy that invite.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'Couldn’t copy that invite.' using errcode = 'P0001';
  end if;

  if not public.is_official_ops()
     and v_c.created_by is distinct from v_uid
     and not exists (
       select 1 from public.challenge_moderators
       where challenge_id = p_challenge_id and user_id = v_uid
     )
     and not exists (
       select 1 from public.challenge_participants
       where challenge_id = p_challenge_id and user_id = v_uid
     ) then
    raise exception 'Couldn’t copy that invite.' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.challenge_invites
  where challenge_id = p_challenge_id
    and inviter_id = v_uid
    and invitee_id is null
    and status = 'pending'
  order by created_at desc
  limit 1;

  if not found then
    insert into public.challenge_invites (
      challenge_id, inviter_id, invitee_id, status
    ) values (
      p_challenge_id, v_uid, null, 'pending'
    )
    returning * into v_invite;
  end if;

  return jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'challenge_id', v_invite.challenge_id,
    'token', v_invite.token
  );
end;
$$;

revoke all on function public.mint_challenge_invite_link(uuid) from public, anon;
grant execute on function public.mint_challenge_invite_link(uuid) to authenticated;

create or replace function public.accept_challenge_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.challenge_invites%rowtype;
  v_existing public.challenge_invites%rowtype;
  v_host uuid;
  v_claim uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'This invite is no longer open.' using errcode = 'P0001';
  end if;

  select * into v_inv
  from public.challenge_invites
  where token = trim(p_token)
  for update;
  if not found then
    raise exception 'This invite is no longer open.' using errcode = 'P0001';
  end if;
  if v_inv.status = 'revoked' then
    raise exception 'This invite is no longer open.' using errcode = 'P0001';
  end if;

  select created_by into v_host from public.challenges where id = v_inv.challenge_id;
  if v_host is not null and public.friendship_is_blocked(v_uid, v_host) then
    raise exception 'This invite isn’t available.' using errcode = 'P0001';
  end if;

  if v_inv.invitee_id is not null and v_inv.invitee_id is distinct from v_uid then
    raise exception 'This invite is no longer open.' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.challenge_invites
  where challenge_id = v_inv.challenge_id
    and invitee_id = v_uid
  order by case when status = 'accepted' then 0 else 1 end, created_at desc
  limit 1;

  if found then
    update public.challenge_invites
      set status = 'accepted',
          accepted_at = coalesce(accepted_at, now())
    where id = v_existing.id;
    return jsonb_build_object(
      'ok', true,
      'challenge_id', v_inv.challenge_id,
      'invite_id', v_existing.id,
      'already_accepted', v_existing.status = 'accepted'
    );
  end if;

  -- Open share token stays pending + invitee_id null so the next person can use it.
  if v_inv.invitee_id is null and v_inv.status = 'pending' then
    insert into public.challenge_invites (
      challenge_id, inviter_id, invitee_id, status, accepted_at
    ) values (
      v_inv.challenge_id, v_inv.inviter_id, v_uid, 'accepted', now()
    )
    returning id into v_claim;
    return jsonb_build_object(
      'ok', true,
      'challenge_id', v_inv.challenge_id,
      'invite_id', v_claim
    );
  end if;

  update public.challenge_invites
    set status = 'accepted',
        invitee_id = coalesce(invitee_id, v_uid),
        accepted_at = coalesce(accepted_at, now())
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_inv.challenge_id,
    'invite_id', v_inv.id
  );
end;
$$;
