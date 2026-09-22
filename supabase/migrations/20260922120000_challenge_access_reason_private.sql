-- Bare /challenges/{id} without a live invite claim fail-closed as private
-- for private / private_corporate rooms. Never geo for those rooms.

create or replace function public.challenge_access_reason(p_challenge_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_uid uuid := auth.uid();
begin
  if p_challenge_id is null then
    return 'hidden';
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return 'hidden';
  end if;

  if coalesce(v_c.privacy_mode, '') in ('private', 'private_corporate')
     or lower(coalesce(v_c.challenge_lane, '')) = 'private' then
    if public.user_can_select_corporate_challenge(p_challenge_id, v_uid)
       or public.user_can_access_challenge(p_challenge_id, v_uid) then
      return 'ok';
    end if;
    return 'private';
  end if;

  if v_c.is_official
     and v_uid is distinct from v_c.created_by
     and not exists (
       select 1 from public.challenge_participants
       where challenge_id = p_challenge_id and user_id = v_uid
     )
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    return 'geo';
  end if;

  if public.user_can_access_challenge(p_challenge_id, v_uid) then
    return 'ok';
  end if;
  return 'hidden';
end;
$$;

grant execute on function public.challenge_access_reason(uuid) to authenticated, anon;
