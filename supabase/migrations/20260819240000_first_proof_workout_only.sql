-- first_proof (+25, "you logged your first proof") only after a real joined-challenge
-- workout proof. Feed posts, create auto-posts, Share, camera open, and host
-- auto-enroll must never grant. claim_user_grant stays idempotent via user_grants.

drop trigger if exists posts_grant_first_proof on public.posts;

create or replace function public.trg_grant_first_proof_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Posts never grant first_proof (feed, create announce, Share, check-in caption).
  return new;
end;
$$;

create or replace function public.challenge_requires_logged_proof(p_challenge public.challenges)
returns table (needs_camera boolean, needs_heart boolean)
language plpgsql
stable
set search_path = public
as $$
declare
  v_proofs jsonb := coalesce(p_challenge.proofs, '[]'::jsonb);
  v_reqs jsonb := coalesce(p_challenge.proof_requirements, '[]'::jsonb);
  v_has_named boolean := jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0;
  v_type text := lower(coalesce(p_challenge.proof_type, ''));
  v_camera boolean := false;
  v_heart boolean := false;
begin
  if v_has_named then
    select
      coalesce(bool_or(lower(coalesce(p->>'method', 'photo')) in ('photo', 'video')), false),
      coalesce(bool_or(lower(coalesce(p->>'method', '')) in ('hr', 'hr_monitor')), false)
    into v_camera, v_heart
    from jsonb_array_elements(v_proofs) p;
  else
    v_camera := v_type in ('photo', 'video', 'pre_selfie', 'post_selfie');
    v_heart := v_type in ('hr', 'hr_monitor');
  end if;

  if jsonb_typeof(v_reqs) = 'array' and jsonb_array_length(v_reqs) > 0 then
    select
      v_camera or coalesce(bool_or(
        coalesce((r->>'required')::boolean, true)
        and lower(coalesce(r->>'type', '')) in ('photo', 'video', 'pre_selfie', 'post_selfie')
      ), false),
      v_heart or coalesce(bool_or(
        coalesce((r->>'required')::boolean, true)
        and lower(coalesce(r->>'type', '')) in ('hr', 'hr_monitor')
      ), false)
    into v_camera, v_heart
    from jsonb_array_elements(v_reqs) r;
  end if;

  return query select v_camera, v_heart;
end;
$$;

create or replace function public.workout_submission_has_required_proof(p_row public.workout_submissions)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_ch public.challenges%rowtype;
  v_needs_camera boolean := false;
  v_needs_heart boolean := false;
  v_has_camera boolean := false;
  v_has_heart boolean := false;
  v_parts jsonb := coalesce(p_row.proof_parts, '{}'::jsonb);
begin
  if p_row.user_id is null or p_row.challenge_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.challenge_participants p
    where p.challenge_id = p_row.challenge_id
      and p.user_id = p_row.user_id
      and coalesce(p.status, 'joined') in ('joined', 'active', 'completed')
  ) then
    return false;
  end if;

  select * into v_ch from public.challenges where id = p_row.challenge_id;
  if not found then
    return false;
  end if;

  select r.needs_camera, r.needs_heart
    into v_needs_camera, v_needs_heart
  from public.challenge_requires_logged_proof(v_ch) r;

  if not v_needs_camera and not v_needs_heart then
    return false;
  end if;

  v_has_camera :=
    coalesce(nullif(p_row.pre_selfie_url, ''), '') <> ''
    or coalesce(nullif(p_row.post_selfie_url, ''), '') <> '';

  v_has_heart :=
    coalesce(nullif(p_row.hr_monitor_url, ''), '') <> ''
    or p_row.health_workout_id is not null
    or lower(coalesce(p_row.proof_kind, '')) = 'health_workout';

  if jsonb_typeof(v_parts) = 'object' then
    select
      v_has_camera or coalesce(bool_or(
        coalesce(v->>'url', '') <> ''
        and lower(coalesce(nullif(v->>'method', ''), 'photo')) in ('photo', 'video')
      ), false),
      v_has_heart or coalesce(bool_or(
        coalesce(v->>'healthWorkoutId', '') <> ''
        or (
          coalesce(v->>'url', '') <> ''
          and lower(coalesce(v->>'method', '')) in ('hr', 'hr_monitor')
        )
      ), false)
    into v_has_camera, v_has_heart
    from jsonb_each(v_parts) as e(k, v)
    where jsonb_typeof(v) = 'object';
  end if;

  if v_needs_camera and not v_has_camera then
    return false;
  end if;
  if v_needs_heart and not v_has_heart then
    return false;
  end if;

  return v_has_camera or v_has_heart;
end;
$$;

create or replace function public.trg_grant_first_proof_workout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.workout_submission_has_required_proof(new) then
    perform public.claim_user_grant(new.user_id, 'first_proof');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists workouts_grant_first_proof on public.workout_submissions;
create trigger workouts_grant_first_proof
  after insert on public.workout_submissions
  for each row execute function public.trg_grant_first_proof_workout();
