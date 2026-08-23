-- Persist Bob Official pitch “Do not show again” for the current filling instance.
-- Cleared implicitly when a new Official challenge id is advertised.

alter table public.profiles
  add column if not exists official_pitch_dismissed_challenge_id uuid;

comment on column public.profiles.official_pitch_dismissed_challenge_id is
  'Official challenge id the user chose Do not show again on the Bob pitch. Pitch returns when a new Official filling instance is advertised.';

create or replace function public.protect_profiles_legal_tutorial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('blob.legal_write', true) = '1' then
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.tos_accepted_at := OLD.tos_accepted_at;
    NEW.privacy_accepted_at := OLD.privacy_accepted_at;
    NEW.skill_attestation_at := OLD.skill_attestation_at;
    NEW.tos_version := OLD.tos_version;
    NEW.privacy_version := OLD.privacy_version;
    NEW.tutorial_completed_at := OLD.tutorial_completed_at;
    NEW.create_tour_opt_out_at := OLD.create_tour_opt_out_at;
    NEW.official_pitch_dismissed_challenge_id := OLD.official_pitch_dismissed_challenge_id;
  end if;
  return NEW;
end;
$$;

create or replace function public.set_official_pitch_dismissed(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_challenge_id is null then
    raise exception 'CHALLENGE_REQUIRED';
  end if;
  perform set_config('blob.legal_write', '1', true);
  update public.profiles
  set official_pitch_dismissed_challenge_id = p_challenge_id
  where id = v_uid
  returning official_pitch_dismissed_challenge_id into v_id;
  return v_id;
end;
$$;

grant execute on function public.set_official_pitch_dismissed(uuid) to authenticated;
