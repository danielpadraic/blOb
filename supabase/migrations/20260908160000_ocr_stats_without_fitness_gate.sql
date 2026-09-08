-- Screenshot OCR numbers must reach posts.checkin_stats even without a generated card
-- and even when the room is not tagged category = fitness.
--
-- checkin_fitness_stats used to return null unless challenges.category was exactly 'fitness'.
-- An HR / distance screenshot still stores proof_parts[slot].health with source = ocr|manual.
-- Live and Home chips read posts.checkin_stats, so that gate hid every screenshot recap.
-- card_url stays optional: chips show from the numbers alone.

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

  -- The slot's URL and its workout reference ride along with its snapshot, selected together so a
  -- snapshot is never paired with another slot's photo or another workout's name.
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

  -- Activity, label and pronoun alone are not a stats line. Checked before the card URL, so a
  -- screenshot with only average HR still becomes a chip row, and a picture-only slot does not.
  if v_stats - 'activity' - 'pronoun' = '{}'::jsonb then
    return null;
  end if;

  if v_label is not null then
    v_stats := v_stats || jsonb_build_object('activity_label', v_label);
  end if;

  if v_card_url is not null then
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

-- Existing screenshot check-ins pick up chips now that the fitness-category gate is gone.
update public.posts p
set checkin_stats = coalesce(public.checkin_fitness_stats(p.checkin_id), p.checkin_stats)
where p.checkin_id is not null
  and p.deleted_at is null;
