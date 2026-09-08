-- Generated recap is an extra last slide. OCR screenshots stay user stills.
--
-- checkin_fitness_stats used to copy the slot URL as card_url for every health snapshot,
-- including OCR. Home/Live then drew the recap *over* that URL, hiding the screenshot.
-- Vendor cards (HealthKit / Health Connect / healthWorkoutId) still name card_url.
-- Screenshot / manual numbers do not — the client appends blob:workout-card.
--
-- checkin_proof_media_urls now includes proof_parts.urls[] and puts vendor cards last.

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
      nullif(btrim(coalesce(part.value ->> 'url', '')), ''),
      nullif(btrim(coalesce(part.value ->> 'healthWorkoutId', '')), '')
    into v_health, v_card_url, v_workout_ref
  from public.challenge_checkins c
  cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
  where c.id = p_checkin_id
    and jsonb_typeof(part.value -> 'health') = 'object'
  limit 1;

  if v_health is null then
    return null;
  end if;

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
  -- Only a vendor raster is named as the card. OCR / manual stills stay photos.
  if v_card_url is not null
     and v_card_url not like 'health:%'
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
  v_vendor boolean;
begin
  for v_elem in
    select value from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb))
  loop
    v_id := coalesce(v_elem->>'id', v_elem->>'method');
    v_part := coalesce(p_parts -> v_id, '{}'::jsonb);
    v_vendor :=
      nullif(btrim(coalesce(v_part->>'healthWorkoutId', '')), '') is not null
      or coalesce(v_part -> 'health' ->> 'source', '') in ('healthkit', 'health_connect');

    v_url := coalesce(nullif(btrim(v_part->>'url'), ''), '');
    if v_url <> '' and v_url not like 'health:%' then
      if v_vendor then
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
        if v_vendor then
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
    if coalesce(v_url, '') <> '' then
      v_stills := v_stills || v_url;
    end if;
  end loop;

  return public.checkin_unique_urls(v_stills || v_cards);
end;
$$;

grant execute on function public.checkin_proof_media_urls(public.challenges, jsonb, public.challenge_checkins) to authenticated, service_role;

-- Drop the screenshot-as-card_url stamp. Do not coalesce: OCR rows must lose card_url.
update public.posts p
set checkin_stats = public.checkin_fitness_stats(p.checkin_id)
where p.checkin_id is not null
  and p.deleted_at is null
  and public.checkin_fitness_stats(p.checkin_id) is not null;

-- Rebuild carousel from proof stills (url + urls[]) then leftover extras. No new posts.
update public.posts p
set media_urls = public.checkin_unique_urls(
  public.checkin_proof_media_urls(ch, c.proof_parts, c)
  || coalesce((
    select array_agg(t.u order by t.ord)
    from unnest(coalesce(p.media_urls, '{}'::text[])) with ordinality as t(u, ord)
    where coalesce(t.u, '') <> ''
      and not exists (
        select 1
        from unnest(public.checkin_proof_media_urls(ch, c.proof_parts, c)) as x(u)
        where lower(split_part(x.u, '?', 1)) = lower(split_part(t.u, '?', 1))
      )
  ), '{}'::text[])
)
from public.challenge_checkins c
join public.challenges ch on ch.id = c.challenge_id
where p.checkin_id = c.id
  and p.deleted_at is null;
