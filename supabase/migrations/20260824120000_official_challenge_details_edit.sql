-- Host can update Official / Private Corporate display fields after publish.
-- Scoring, privacy, Official flag, and schedule stay locked.

create or replace function public.update_official_challenge_details(
  p_challenge_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_staff boolean := false;
  v_title text;
  v_proofs jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(is_official, false) or coalesce(is_admin, false)
    into v_staff
    from public.profiles
    where id = v_uid;
  v_staff := coalesce(v_staff, false);

  if ch.created_by is distinct from v_uid and not v_staff then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not coalesce(ch.is_official, false)
     and coalesce(ch.privacy_mode, '') is distinct from 'private_corporate' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if ch.status in ('settled', 'cancelled', 'cancelled_underfilled', 'distributing') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_DETAILS';
  end if;

  if p_payload ? 'title' then
    v_title := nullif(btrim(p_payload->>'title'), '');
    if v_title is null then
      raise exception 'TITLE_REQUIRED';
    end if;
  end if;

  if p_payload ? 'proofs' then
    v_proofs := p_payload->'proofs';
    if jsonb_typeof(v_proofs) <> 'array' or coalesce(jsonb_array_length(v_proofs), 0) < 1 then
      raise exception 'INVALID_PROOFS';
    end if;
  end if;

  update public.challenges
  set
    title = case
      when p_payload ? 'title' then v_title
      else title
    end,
    description = case
      when p_payload ? 'description' then nullif(btrim(p_payload->>'description'), '')
      else description
    end,
    cover_image_url = case
      when p_payload ? 'cover_image_url' then nullif(btrim(p_payload->>'cover_image_url'), '')
      else cover_image_url
    end,
    rules = case
      when p_payload ? 'rules' then nullif(btrim(p_payload->>'rules'), '')
      else rules
    end,
    sponsor_name = case
      when p_payload ? 'sponsor_name' then nullif(btrim(p_payload->>'sponsor_name'), '')
      else sponsor_name
    end,
    proofs = case
      when p_payload ? 'proofs' then v_proofs
      else proofs
    end,
    proof_requirements = case
      when p_payload ? 'proof_requirements' then coalesce(p_payload->'proof_requirements', proof_requirements)
      else proof_requirements
    end,
    proof_type = case
      when p_payload ? 'proof_type' then coalesce(nullif(btrim(p_payload->>'proof_type'), ''), proof_type)
      else proof_type
    end,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  return to_jsonb(ch);
end;
$$;

grant execute on function public.update_official_challenge_details(uuid, jsonb) to authenticated;
