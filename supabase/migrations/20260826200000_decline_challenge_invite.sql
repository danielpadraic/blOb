-- Invitee can decline a pending invite. Uses existing challenge_invites + revoked.
-- Open token links stay pending so other people can still use them.

create or replace function public.decline_challenge_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.challenge_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  select * into v_invite
  from public.challenge_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'INVITE_REVOKED';
  end if;

  if v_invite.status = 'accepted' and v_invite.invitee_id = v_uid then
    raise exception 'ALREADY_JOINED';
  end if;

  if v_invite.invitee_id is not null and v_invite.invitee_id is distinct from v_uid then
    raise exception 'INVITE_USED';
  end if;

  if v_invite.invitee_id = v_uid and v_invite.status = 'pending' then
    update public.challenge_invites
    set status = 'revoked'
    where id = v_invite.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_invite.challenge_id
  );
end;
$$;

grant execute on function public.decline_challenge_invite(text) to authenticated;
revoke all on function public.decline_challenge_invite(text) from public, anon;

notify pgrst, 'reload schema';
