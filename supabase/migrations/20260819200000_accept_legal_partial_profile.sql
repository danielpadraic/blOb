-- accept_legal must work on a partial profile. Create the minimum row if missing.
-- Do not require username/display name/fitness fields beyond the stub username.
-- Safe to re-run.

create or replace function public.accept_legal(
  p_tos boolean,
  p_privacy boolean,
  p_skill boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tos text := '2026-08-19';
  v_privacy text := '2026-08-19';
  v_now timestamptz := now();
  v_username text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_tos is not true or p_privacy is not true or p_skill is not true then
    raise exception 'LEGAL_REQUIRED';
  end if;

  perform set_config('blob.legal_write', '1', true);

  v_username := 'blob_' || substr(replace(v_uid::text, '-', ''), 1, 10);

  begin
    insert into public.profiles as p (
      id,
      username,
      tos_accepted_at,
      privacy_accepted_at,
      skill_attestation_at,
      tos_version,
      privacy_version
    )
    values (
      v_uid,
      v_username,
      v_now,
      v_now,
      v_now,
      v_tos,
      v_privacy
    )
    on conflict (id) do update set
      tos_accepted_at = coalesce(p.tos_accepted_at, excluded.tos_accepted_at),
      privacy_accepted_at = coalesce(p.privacy_accepted_at, excluded.privacy_accepted_at),
      skill_attestation_at = coalesce(p.skill_attestation_at, excluded.skill_attestation_at),
      tos_version = excluded.tos_version,
      privacy_version = excluded.privacy_version;
  exception
    when unique_violation then
      update public.profiles
      set
        tos_accepted_at = coalesce(tos_accepted_at, v_now),
        privacy_accepted_at = coalesce(privacy_accepted_at, v_now),
        skill_attestation_at = coalesce(skill_attestation_at, v_now),
        tos_version = v_tos,
        privacy_version = v_privacy
      where id = v_uid;
      if not found then
        insert into public.profiles (
          id,
          username,
          tos_accepted_at,
          privacy_accepted_at,
          skill_attestation_at,
          tos_version,
          privacy_version
        )
        values (
          v_uid,
          'blob_' || substr(replace(v_uid::text, '-', ''), 1, 12),
          v_now,
          v_now,
          v_now,
          v_tos,
          v_privacy
        );
      end if;
  end;

  return jsonb_build_object(
    'ok', true,
    'tos_version', v_tos,
    'privacy_version', v_privacy,
    'accepted_at', v_now
  );
end;
$$;

grant execute on function public.accept_legal(boolean, boolean, boolean) to authenticated;
