-- Check-in feed body is the share field, or "Check-in Complete" when empty.
-- Do not invent "{Name} is {task}!" / "{Name} checked in for {title}."
-- save_checkin_proof / submit_checkin math is unchanged.

create or replace function public.checkin_post_caption(p_complete boolean, p_notes text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(btrim(p_notes), ''), 'Check-in Complete');
$$;

create or replace function public.stamp_location_complete_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_label is null or new.submitted_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    return new;
  end if;
  update public.posts
  set
    location_name = new.location_label,
    checkin_stage = 'complete'
  where checkin_id = new.id
    and deleted_at is null;
  return new;
end;
$$;

create or replace function public.submit_location_proof(
  p_challenge_id uuid,
  p_proof_id text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_place public.challenge_proof_places%rowtype;
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_checkin_id uuid;
  v_ready boolean;
  v_label text;
  v_meters double precision;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'LOCATION_NEED_PHONE';
  end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > 80 then
    raise exception 'LOCATION_NEED_PHONE';
  end if;

  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into v_place
  from public.challenge_proof_places
  where challenge_id = p_challenge_id and proof_id = p_proof_id;
  if not found then
    raise exception 'This challenge has no place pin.';
  end if;
  if p_accuracy_m > v_place.radius_m then
    raise exception 'LOCATION_NEED_PHONE';
  end if;

  v_meters := public.geo_distance_m(p_lat, p_lng, v_place.lat, v_place.lng);
  v_label := coalesce(nullif(btrim(v_place.label), ''), 'the pinned place');
  if v_meters > v_place.radius_m then
    raise exception 'LOCATION_TOO_FAR:%', v_label;
  end if;

  v_row := public.save_checkin_proof(
    p_challenge_id,
    p_proof_id,
    jsonb_build_object(
      'method', 'location',
      'place_id', v_place.place_id,
      'label', v_label,
      'radius_m', v_place.radius_m,
      'in_fence', true,
      'accuracy_m', p_accuracy_m,
      'submitted_at', now()
    ),
    null,
    null,
    null,
    false
  );
  v_checkin_id := (v_row->>'id')::uuid;

  update public.challenge_checkins
  set
    location_place_id = v_place.place_id,
    location_label = v_label,
    location_radius_m = v_place.radius_m,
    location_submitted_at = now(),
    location_accuracy_m = p_accuracy_m,
    location_in_fence = true,
    location_lat = p_lat,
    location_lng = p_lng
  where id = v_checkin_id;

  select public.checkin_proofs_ready(ch, proof_parts) into v_ready
  from public.challenge_checkins
  where id = v_checkin_id;

  update public.posts
  set
    location_name = v_label,
    checkin_stage = case when v_ready then 'complete' else coalesce(checkin_stage, 'proof') end
  where checkin_id = v_checkin_id
    and deleted_at is null;

  return public.checkin_row_json(v_checkin_id);
end;
$$;
