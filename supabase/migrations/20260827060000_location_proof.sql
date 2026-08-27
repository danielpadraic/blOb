-- Location proof: one pin per proof, private coordinates, no live tracking.

alter table public.posts
  add column if not exists location_name text;

comment on column public.posts.location_name is
  'Place label only. Never store lat/lng or a street address here.';

alter table public.challenge_checkins
  add column if not exists location_place_id text,
  add column if not exists location_label text,
  add column if not exists location_radius_m integer,
  add column if not exists location_submitted_at timestamptz,
  add column if not exists location_accuracy_m numeric,
  add column if not exists location_in_fence boolean,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

comment on column public.challenge_checkins.location_lat is
  'Submit-time GPS. Owner write via RPC only. Not for the social card.';
comment on column public.challenge_checkins.location_lng is
  'Submit-time GPS. Owner write via RPC only. Not for the social card.';

create table if not exists public.challenge_proof_places (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  proof_id text not null,
  label text not null default '',
  place_id text,
  lat double precision not null,
  lng double precision not null,
  radius_m integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, proof_id),
  constraint challenge_proof_places_radius_check
    check (radius_m between 30 and 1000)
);

alter table public.challenge_proof_places enable row level security;

drop policy if exists "Hosts manage challenge proof places" on public.challenge_proof_places;
create policy "Hosts manage challenge proof places"
  on public.challenge_proof_places
  for all
  to authenticated
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );

grant select, insert, update, delete on public.challenge_proof_places to authenticated;

revoke select (location_lat, location_lng) on public.challenge_checkins from anon, authenticated;
revoke insert (location_lat, location_lng) on public.challenge_checkins from anon, authenticated;
revoke update (location_lat, location_lng) on public.challenge_checkins from anon, authenticated;

create or replace function public.geo_distance_m(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(least(1::double precision, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$$;

create or replace function public.checkin_proofs_ready(ch public.challenges, p_parts jsonb)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  rec record;
  v_proofs jsonb;
  v_part jsonb;
  v_method text;
  v_needs boolean := false;
  v_required numeric;
begin
  v_proofs := coalesce(ch.proofs, '[]'::jsonb);
  if jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0 then
    for rec in select elem from jsonb_array_elements(v_proofs) elem
    loop
      v_method := coalesce(rec.elem->>'method', 'photo');
      if v_method = 'honor' then
        continue;
      end if;
      v_needs := true;
      v_part := coalesce(p_parts -> coalesce(rec.elem->>'id', ''), '{}'::jsonb);
      if v_method = 'checkin' then
        if coalesce(nullif(v_part->>'text', ''), nullif(v_part->>'url', ''), '') = '' then
          return false;
        end if;
      elsif v_method = 'hr' then
        if coalesce(v_part->>'url', '') = ''
           and coalesce(v_part->>'healthWorkoutId', v_part->>'health_workout_id', '') = '' then
          return false;
        end if;
      elsif v_method = 'distance' then
        v_required := coalesce(
          nullif((rec.elem->>'distance_meters')::numeric, 0),
          nullif(ch.distance_meters_required, 0),
          1609.34
        );
        if public.checkin_part_distance_meters(v_part) < v_required then
          return false;
        end if;
      elsif v_method = 'location' then
        if coalesce((v_part->>'in_fence')::boolean, false) is not true then
          return false;
        end if;
      else
        if coalesce(v_part->>'url', '') = '' then
          return false;
        end if;
      end if;
    end loop;
    return true;
  end if;

  for rec in
    select coalesce(req->>'type', '') as proof_type
    from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
    where coalesce((req->>'required')::boolean, true)
  loop
    v_needs := true;
    if rec.proof_type = 'pre_selfie' and coalesce(p_parts->'pre'->>'url', p_parts->'pre_selfie'->>'url', '') = '' then
      return false;
    end if;
    if rec.proof_type = 'post_selfie' and coalesce(p_parts->'post'->>'url', p_parts->'post_selfie'->>'url', '') = '' then
      return false;
    end if;
    if rec.proof_type in ('hr_monitor', 'hr')
       and coalesce(p_parts->'hr'->>'url', p_parts->'hr_monitor'->>'url', '') = ''
       and coalesce(p_parts->'hr'->>'healthWorkoutId', p_parts->'hr'->>'health_workout_id', '') = '' then
      return false;
    end if;
    if rec.proof_type = 'distance'
       and public.checkin_part_distance_meters(
         coalesce(p_parts->'distance', p_parts->'miles', '{}'::jsonb)
       ) < coalesce(nullif(ch.distance_meters_required, 0), 1609.34) then
      return false;
    end if;
    if rec.proof_type = 'location'
       and coalesce((coalesce(p_parts->'location', '{}'::jsonb)->>'in_fence')::boolean, false) is not true then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.set_challenge_proof_place(
  p_challenge_id uuid,
  p_proof_id text,
  p_label text,
  p_place_id text,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_radius integer := greatest(30, least(1000, coalesce(p_radius_m, 100)));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'Drop a pin for the Location proof.';
  end if;
  if not exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and c.created_by = auth.uid()
  ) then
    raise exception 'Only the host can set the place.';
  end if;
  insert into public.challenge_proof_places (
    challenge_id, proof_id, label, place_id, lat, lng, radius_m, updated_at
  ) values (
    p_challenge_id, p_proof_id, coalesce(nullif(btrim(p_label), ''), 'Pinned place'),
    p_place_id, p_lat, p_lng, v_radius, now()
  )
  on conflict (challenge_id, proof_id) do update set
    label = excluded.label,
    place_id = excluded.place_id,
    lat = excluded.lat,
    lng = excluded.lng,
    radius_m = excluded.radius_m,
    updated_at = now();
end;
$$;

create or replace function public.get_challenge_proof_places(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host boolean;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;
  select exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and c.created_by = auth.uid()
  ) into v_host;
  return coalesce((
    select jsonb_agg(
      case when v_host then
        jsonb_build_object(
          'proof_id', p.proof_id,
          'label', p.label,
          'place_id', p.place_id,
          'lat', p.lat,
          'lng', p.lng,
          'radius_m', p.radius_m
        )
      else
        jsonb_build_object(
          'proof_id', p.proof_id,
          'label', p.label,
          'place_id', p.place_id,
          'radius_m', p.radius_m
        )
      end
    )
    from public.challenge_proof_places p
    where p.challenge_id = p_challenge_id
  ), '[]'::jsonb);
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
  v_name text;
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

  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(username), ''), 'Someone')
    into v_name
  from public.profiles
  where id = v_uid;

  select public.checkin_proofs_ready(ch, proof_parts) into v_ready
  from public.challenge_checkins
  where id = v_checkin_id;

  update public.posts
  set
    content = case
      when v_ready then v_name || ' checked in for ' || coalesce(nullif(btrim(ch.title), ''), 'the challenge') || '.'
      else v_name || ' is at ' || v_label || '!'
    end,
    location_name = v_label,
    checkin_stage = case when v_ready then 'complete' else coalesce(checkin_stage, 'proof') end
  where checkin_id = v_checkin_id
    and deleted_at is null;

  return public.checkin_row_json(v_checkin_id);
end;
$$;

grant execute on function public.geo_distance_m(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.set_challenge_proof_place(uuid, text, text, text, double precision, double precision, integer) to authenticated;
grant execute on function public.get_challenge_proof_places(uuid) to authenticated;
grant execute on function public.submit_location_proof(uuid, text, double precision, double precision, numeric) to authenticated;
