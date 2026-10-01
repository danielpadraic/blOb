-- The Fitness recap is an extra slide. A selfie or a screenshot stays.
-- card_url names a workout_card- file only. OCR rows do not get one.

create or replace function public.checkin_fitness_stats(p_checkin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_user_id uuid;
  v_health jsonb;
  v_card_url text;
  v_workout_ref text;
  v_label text;
  v_pronoun text;
  v_stats jsonb := '{}'::jsonb;
  v_value numeric;
  v_series jsonb;
  v_source text;
begin
  if p_checkin_id is null then
    return null;
  end if;

  select c.challenge_id, c.user_id into v_challenge_id, v_user_id
  from public.challenge_checkins c
  where c.id = p_checkin_id;

  if v_challenge_id is null then
    return null;
  end if;

  select
      part.value -> 'health',
      nullif(btrim(coalesce(part.value ->> 'healthWorkoutId', '')), '')
    into v_health, v_workout_ref
  from public.challenge_checkins c
  cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
  where c.id = p_checkin_id
    and jsonb_typeof(part.value -> 'health') = 'object'
  limit 1;

  if v_health is null then
    return null;
  end if;

  select picked.url
    into v_card_url
  from (
    select nullif(btrim(coalesce(part.value ->> 'url', '')), '') as url
    from public.challenge_checkins c
    cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
    where c.id = p_checkin_id
      and jsonb_typeof(part.value -> 'health') = 'object'
    union all
    select nullif(btrim(item.url), '')
    from public.challenge_checkins c
    cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(part.value -> 'urls') = 'array' then part.value -> 'urls'
        else '[]'::jsonb
      end
    ) as item(url)
    where c.id = p_checkin_id
      and jsonb_typeof(part.value -> 'health') = 'object'
  ) as picked
  where public.checkin_is_recap_url(picked.url, null)
  limit 1;

  if coalesce(btrim(v_health ->> 'activityType'), '') <> '' then
    v_stats := v_stats || jsonb_build_object('activity', btrim(v_health ->> 'activityType'));
  end if;

  if v_workout_ref is not null and v_workout_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select nullif(btrim(coalesce(hw.activity_label, '')), '')
      into v_label
    from public.health_workouts hw
    where hw.id = v_workout_ref::uuid;
  end if;

  select case
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('he', 'him', 'he/him') then 'he'
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('she', 'her', 'she/her') then 'she'
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('they', 'them', 'they/them') then 'they'
    when lower(btrim(coalesce(pr.gender, ''))) = 'male' then 'he'
    when lower(btrim(coalesce(pr.gender, ''))) = 'female' then 'she'
    else null
  end
  into v_pronoun
  from public.profiles pr
  where pr.id = v_user_id;

  if v_pronoun is not null then
    v_stats := v_stats || jsonb_build_object('pronoun', v_pronoun);
  end if;

  v_value := public.checkin_stat_number(v_health, 'durationSec');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('duration_sec', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'activeEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('active_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'totalEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('total_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'minHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_min', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'avgHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_avg', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'maxHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_max', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'distanceMeters');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('distance_m', round(v_value));
  end if;

  if v_stats - 'activity' - 'pronoun' = '{}'::jsonb then
    return null;
  end if;

  if v_label is not null then
    v_stats := v_stats || jsonb_build_object('activity_label', v_label);
  end if;

  v_source := coalesce(v_health ->> 'source', '');
  if v_card_url is not null
     and (
       v_workout_ref is not null
       or v_source in ('healthkit', 'health_connect')
     ) then
    v_stats := v_stats || jsonb_build_object('card_url', v_card_url);
  end if;

  if jsonb_typeof(v_health -> 'hrSeries') = 'array'
     and jsonb_array_length(v_health -> 'hrSeries') > 0 then
    select jsonb_agg(round(t.value::numeric) order by t.ord)
      into v_series
    from jsonb_array_elements_text(v_health -> 'hrSeries') with ordinality as t(value, ord)
    where t.value ~ '^[0-9]+(\.[0-9]+)?$'
      and t.value::numeric between 20 and 260;

    if v_series is not null and jsonb_array_length(v_series) between 1 and 240 then
      v_stats := v_stats || jsonb_build_object('hr_series', v_series);
    end if;
  end if;

  return v_stats;
end;
$$;

grant execute on function public.checkin_fitness_stats(uuid) to authenticated, service_role;

create or replace function public.checkin_proof_media_urls(
  ch public.challenges,
  p_parts jsonb,
  p_row public.challenge_checkins
)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_stills text[] := '{}';
  v_cards text[] := '{}';
  v_elem jsonb;
  v_part jsonb;
  v_id text;
  v_url text;
  v_item text;
begin
  for v_elem in
    select value from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb))
  loop
    v_id := coalesce(v_elem->>'id', v_elem->>'method');
    v_part := coalesce(p_parts -> v_id, '{}'::jsonb);
    v_url := coalesce(nullif(btrim(v_part->>'url'), ''), '');
    if v_url <> '' and v_url not like 'health:%' then
      if public.checkin_is_recap_url(v_url, null) then
        v_cards := v_cards || v_url;
      else
        v_stills := v_stills || v_url;
      end if;
    end if;

    if jsonb_typeof(v_part -> 'urls') = 'array' then
      for v_item in
        select jsonb_array_elements_text(v_part -> 'urls')
      loop
        v_url := coalesce(nullif(btrim(v_item), ''), '');
        if v_url = '' or v_url like 'health:%' then
          continue;
        end if;
        if public.checkin_is_recap_url(v_url, null) then
          v_cards := v_cards || v_url;
        else
          v_stills := v_stills || v_url;
        end if;
      end loop;
    end if;
  end loop;

  foreach v_url in array array[
    p_row.pre_selfie_url,
    p_row.post_selfie_url,
    p_row.hr_monitor_url
  ]
  loop
    if coalesce(v_url, '') <> '' and v_url not like 'health:%' then
      if public.checkin_is_recap_url(v_url, null) then
        v_cards := v_cards || v_url;
      else
        v_stills := v_stills || v_url;
      end if;
    end if;
  end loop;

  return public.checkin_media_stills_then_recap(v_stills || v_cards, v_cards[1]);
end;
$$;

grant execute on function public.checkin_proof_media_urls(public.challenges, jsonb, public.challenge_checkins) to authenticated, service_role;

create or replace function public.repair_checkin_workout_card(
  p_checkin_id uuid,
  p_proof_id text,
  p_url text,
  p_card_version integer,
  p_hr_series jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenge_checkins%rowtype;
  ch public.challenges%rowtype;
  v_parts jsonb;
  v_part jsonb;
  v_name text;
  v_is_hr boolean;
  v_media text[];
  v_old_media text[];
  v_old_url text;
  v_slot_url text;
  v_kept text[] := '{}';
  v_item text;
  v_captions text[];
  v_new_captions text[];
  v_series jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(p_url, '') = '' then
    raise exception 'MISSING_CARD';
  end if;

  select * into c from public.challenge_checkins where id = p_checkin_id;
  if not found or c.user_id is distinct from v_uid then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  select * into ch from public.challenges where id = c.challenge_id;
  if not found then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  v_parts := coalesce(c.proof_parts, '{}'::jsonb);
  v_part := v_parts -> p_proof_id;
  if v_part is null or v_part = 'null'::jsonb then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if coalesce(v_part->>'healthWorkoutId', '') = ''
     or (v_part->'health') is null
     or (v_part->'health') = 'null'::jsonb then
    raise exception 'NOT_A_WORKOUT_SLOT';
  end if;

  v_old_url := coalesce(v_part->>'url', '');

  select lower(coalesce(elem->>'name', '')) into v_name
  from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') = p_proof_id
  limit 1;
  v_is_hr := coalesce(v_part->>'method', '') = 'hr' or coalesce(v_name, '') like '%heart%';

  if jsonb_typeof(v_part -> 'urls') = 'array' then
    for v_item in
      select jsonb_array_elements_text(v_part -> 'urls')
    loop
      if coalesce(nullif(btrim(v_item), ''), '') = '' or v_item like 'health:%' then
        continue;
      end if;
      if v_item = p_url or public.checkin_is_recap_url(v_item, null) then
        continue;
      end if;
      v_kept := v_kept || v_item;
    end loop;
  end if;
  if v_old_url <> ''
     and v_old_url not like 'health:%'
     and not public.checkin_is_recap_url(v_old_url, null)
     and v_old_url <> all (v_kept) then
    v_kept := v_kept || v_old_url;
  end if;

  v_slot_url := case
    when v_old_url <> ''
      and v_old_url not like 'health:%'
      and not public.checkin_is_recap_url(v_old_url, null)
    then v_old_url
    else p_url
  end;

  v_part := v_part || jsonb_build_object(
    'url', v_slot_url,
    'urls', to_jsonb(public.checkin_unique_urls(v_kept || array[p_url])),
    'cardVersion', greatest(coalesce(p_card_version, 1), 1)
  );

  if jsonb_typeof(p_hr_series) = 'array' and jsonb_typeof(v_part -> 'health') = 'object' then
    select jsonb_agg(round(t.value::numeric) order by t.ord)
      into v_series
    from jsonb_array_elements_text(p_hr_series) with ordinality as t(value, ord)
    where t.value ~ '^[0-9]+(\.[0-9]+)?$'
      and t.value::numeric between 20 and 260;

    if v_series is not null and jsonb_array_length(v_series) between 1 and 240 then
      v_part := jsonb_set(v_part, '{health,hrSeries}', v_series, true);
    end if;
  end if;

  v_parts := v_parts || jsonb_build_object(p_proof_id, v_part);

  update public.challenge_checkins
  set proof_parts = v_parts,
      hr_monitor_url = case
        when v_is_hr and (
          hr_monitor_url is null
          or btrim(hr_monitor_url) = ''
          or hr_monitor_url like 'health:%'
          or public.checkin_is_recap_url(hr_monitor_url, null)
        ) then p_url
        else hr_monitor_url
      end,
      updated_at = now()
  where id = c.id
  returning * into c;

  select p.media_urls, p.media_captions into v_old_media, v_captions
  from public.posts p
  where p.checkin_id = c.id and p.deleted_at is null
  order by p.created_at asc, p.id asc
  limit 1;

  v_media := public.checkin_media_stills_then_recap(
    coalesce((
      select array_agg(t.u order by t.ord)
      from unnest(coalesce(v_old_media, '{}'::text[])) with ordinality as t(u, ord)
      where coalesce(t.u, '') <> ''
        and not public.checkin_is_recap_url(t.u, null)
    ), '{}'::text[])
    || public.checkin_proof_media_urls(ch, v_parts, c)
    || array[p_url],
    p_url
  );

  if v_captions is not null then
    select array_agg(coalesce(v_captions[array_position(v_old_media, look.url)], '') order by m.ord)
      into v_new_captions
    from unnest(v_media) with ordinality as m(url, ord)
    cross join lateral (
      select case when m.url = p_url and v_old_url <> '' then v_old_url else m.url end as url
    ) look;
  end if;

  update public.posts
  set media_urls = v_media,
      media_captions = coalesce(v_new_captions, '{}'::text[])
  where checkin_id = c.id and deleted_at is null;

  update public.posts p
  set checkin_stats = coalesce(public.checkin_fitness_stats(c.id), p.checkin_stats)
  where p.checkin_id = c.id and p.deleted_at is null;

  return jsonb_build_object('checkin_id', c.id, 'media', to_jsonb(v_media));
end;
$$;

revoke all on function public.repair_checkin_workout_card(uuid, text, text, integer, jsonb) from public;
revoke all on function public.repair_checkin_workout_card(uuid, text, text, integer, jsonb) from anon;
grant execute on function public.repair_checkin_workout_card(uuid, text, text, integer, jsonb) to authenticated;
