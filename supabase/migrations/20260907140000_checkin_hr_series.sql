-- The heart-rate trace: stored on the check-in, published on the post.
--
-- A workout proof card graphs heart rate for the length of the workout. That graph was drawn from the
-- sample series read out of HealthKit at attach time, and the series itself was never stored -- which
-- was survivable only while the card was a flattened JPEG. Now that a posted card is drawn from the
-- row, every card lost its graph: an average, a minimum and a maximum cannot be turned back into a
-- trace.
--
-- Two changes. The repair pass gains a way to save a trace it re-read on the owner's device, and
    10|-- checkin_fitness_stats copies that trace onto the post, so the graph is drawn for everyone who can
-- see the post rather than only for participants who can read proof_parts.
--
-- hr_series is the same class of reading as hr_avg and hr_max, which posts already carry. BPM only,
-- with no timestamps: it says how the effort moved, never where or when.

-- 1) Let a card repair store the trace it read, and nothing else new.
--
-- The narrowness of this function is what makes it safe, so p_hr_series is validated as an array of
-- plausible readings and merged under exactly one key. Nothing that decides whether a check-in counts
    20|-- -- status, period, duration, distance, the average heart rate the gates read -- is writable here.
create or replace function public.repair_checkin_workout_card(
  p_checkin_id uuid,
  p_proof_id text,
  p_url text,
  p_card_version integer,
  p_hr_series jsonb default null
)
returns jsonb
language plpgsql
    30|security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenge_checkins%rowtype;
  ch public.challenges%rowtype;
  v_parts jsonb;
  v_part jsonb;
  v_name text;
    40|  v_is_hr boolean;
  v_media text[];
  v_old_media text[];
  v_old_url text;
  v_captions text[];
  v_new_captions text[];
  v_series jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
    50|  end if;
  if coalesce(p_url, '') = '' then
    raise exception 'MISSING_CARD';
  end if;

  select * into c from public.challenge_checkins where id = p_checkin_id;
  -- Owner only. Nobody repairs a card on somebody else's check-in, even an admin.
  if not found or c.user_id is distinct from v_uid then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;
    60|
  select * into ch from public.challenges where id = c.challenge_id;
  if not found then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  v_parts := coalesce(c.proof_parts, '{}'::jsonb);
  v_part := v_parts -> p_proof_id;
  if v_part is null or v_part = 'null'::jsonb then
    raise exception 'SLOT_NOT_FOUND';
    70|  end if;

  -- The gate that keeps this from becoming a way to post arbitrary proof: the slot must already be a
  -- Health attach. A photo slot, an honor slot or a typed slot is refused outright.
  if coalesce(v_part->>'healthWorkoutId', '') = ''
     or (v_part->'health') is null
     or (v_part->'health') = 'null'::jsonb then
    raise exception 'NOT_A_WORKOUT_SLOT';
  end if;

    80|  -- Kept so the caption and the legacy mirror that belonged to the old card can follow it.
  v_old_url := coalesce(v_part->>'url', '');

  select lower(coalesce(elem->>'name', '')) into v_name
  from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') = p_proof_id
  limit 1;
  v_is_hr := coalesce(v_part->>'method', '') = 'hr' or coalesce(v_name, '') like '%heart%';

  v_part := v_part || jsonb_build_object(
    90|    'url', p_url,
    'urls', jsonb_build_array(p_url),
    'cardVersion', greatest(coalesce(p_card_version, 1), 1)
  );

  -- Only readings survive. A payload that is not an array of plausible numbers is ignored rather than
  -- stored, and null leaves any existing trace alone -- so redrawing the card of a workout that has
  -- aged out of Apple Health never erases the graph it already had.
  if jsonb_typeof(p_hr_series) = 'array' and jsonb_typeof(v_part -> 'health') = 'object' then
    select jsonb_agg(round(t.value::numeric) order by t.ord)
   100|      into v_series
    from jsonb_array_elements_text(p_hr_series) with ordinality as t(value, ord)
    where t.value ~ '^[0-9]+(\.[0-9]+)?$'
      and t.value::numeric between 20 and 260;

    if v_series is not null and jsonb_array_length(v_series) between 1 and 240 then
      v_part := jsonb_set(v_part, '{health,hrSeries}', v_series, true);
    end if;
  end if;

   110|  v_parts := v_parts || jsonb_build_object(p_proof_id, v_part);

  -- The media list is rebuilt from the slots PLUS these legacy single-url mirrors, so leaving a mirror
  -- pointing at the old file would put the old card on the post right beside the new one.
  update public.challenge_checkins
  set proof_parts = v_parts,
      hr_monitor_url = case
        when v_is_hr then p_url
        when v_old_url <> '' and hr_monitor_url = v_old_url then p_url
        else hr_monitor_url
   120|      end,
      pre_selfie_url = case
        when v_old_url <> '' and pre_selfie_url = v_old_url then p_url
        else pre_selfie_url
      end,
      post_selfie_url = case
        when v_old_url <> '' and post_selfie_url = v_old_url then p_url
        else post_selfie_url
      end,
      updated_at = now()
   130|  where id = c.id
  returning * into c;

  v_media := public.checkin_unique_urls(public.checkin_proof_media_urls(ch, v_parts, c));

  -- Captions are positional against media_urls, and a slot that had no card gains one, which shifts
  -- every position after it. So they are carried across by URL rather than by index: each picture keeps
  -- its own words, and a picture that is new to the array simply has none.
  select p.media_urls, p.media_captions into v_old_media, v_captions
  from public.posts p
   140|  where p.checkin_id = c.id and p.deleted_at is null
  limit 1;

  if v_captions is not null then
    select array_agg(v_captions[array_position(v_old_media, look.url)] order by m.ord)
      into v_new_captions
    from unnest(v_media) with ordinality as m(url, ord)
    cross join lateral (
      -- The card's file name changes when it is drawn again, so its own caption is looked up under the
      -- URL it is replacing. Every other picture is matched by itself.
   150|      select case when m.url = p_url and v_old_url <> '' then v_old_url else m.url end as url
    ) look;
  end if;

  -- media_captions rejects nulls, and losing the repair to that would leave the wrong card on the post
  -- with a new file already uploaded behind it. An empty array is the honest value for "no captions".
  update public.posts
  set media_urls = v_media,
      media_captions = coalesce(v_new_captions, '{}'::text[])
  where checkin_id = c.id and deleted_at is null;
   160|
  -- The trace has to reach the post for the feed to graph it. The stats trigger on proof_parts already
  -- fired above; recomputed here as well so publishing does not depend on trigger order.
  update public.posts p
  set checkin_stats = coalesce(public.checkin_fitness_stats(c.id), p.checkin_stats)
  where p.checkin_id = c.id and p.deleted_at is null;

  return jsonb_build_object('checkin_id', c.id, 'media', to_jsonb(v_media));
end;
$$;

   170|revoke all on function public.repair_checkin_workout_card(uuid, text, text, integer, jsonb) from public;
revoke all on function public.repair_checkin_workout_card(uuid, text, text, integer, jsonb) from anon;
grant execute on function public.repair_checkin_workout_card(uuid, text, text, integer, jsonb) to authenticated;

-- The four-argument version is dropped rather than left beside the new one: two overloads reachable by
-- the same call would make it ambiguous which one PostgREST picks.
drop function if exists public.repair_checkin_workout_card(uuid, text, text, integer);

-- 2) Publish the trace on the post, beside the numbers already there.
--
   180|-- Same body as the activity_label version plus the hr_series block at the end.
create or replace function public.checkin_fitness_stats(p_checkin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
   190|  v_user_id uuid;
  v_category text;
  v_health jsonb;
  v_card_url text;
  v_workout_ref text;
  v_label text;
  v_pronoun text;
  v_stats jsonb := '{}'::jsonb;
  v_value numeric;
  v_series jsonb;
   200|begin
  if p_checkin_id is null then
    return null;
  end if;

  select c.challenge_id, c.user_id into v_challenge_id, v_user_id
  from public.challenge_checkins c
  where c.id = p_checkin_id;

  if v_challenge_id is null then
   210|    return null;
  end if;

  select lower(btrim(coalesce(ch.category, ''))) into v_category
  from public.challenges ch
  where ch.id = v_challenge_id;

  if coalesce(v_category, '') <> 'fitness' then
    return null;
  end if;
   220|
  -- The slot's URL and its workout reference ride along with its snapshot, selected together so a
  -- snapshot is never paired with another slot's photo or another workout's name.
  select
      part.value -> 'health',
      nullif(btrim(coalesce(part.value ->> 'url', '')), ''),
      nullif(btrim(coalesce(part.value ->> 'healthWorkoutId', '')), '')
    into v_health, v_card_url, v_workout_ref
  from public.challenge_checkins c
  cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
   230|  where c.id = p_checkin_id
    and jsonb_typeof(part.value -> 'health') = 'object'
  limit 1;

  if v_health is null then
    return null;
  end if;

  if coalesce(btrim(v_health ->> 'activityType'), '') <> '' then
    v_stats := v_stats || jsonb_build_object('activity', btrim(v_health ->> 'activityType'));
   240|  end if;

  -- Checked against the uuid shape before casting: the slot is jsonb written by the client, and a
  -- malformed reference would otherwise abort the whole stats build over a cosmetic label.
  if v_workout_ref is not null and v_workout_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select nullif(btrim(coalesce(hw.activity_label, '')), '')
      into v_label
    from public.health_workouts hw
    where hw.id = v_workout_ref::uuid;
  end if;
   250|
  -- Subject pronoun for the prose, from the author's own profile. pronoun wins over gender.
  -- Only the pronoun travels onto the post; gender itself never leaves the profile.
  select case
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('he', 'him', 'he/him') then 'he'
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('she', 'her', 'she/her') then 'she'
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('they', 'them', 'they/them') then 'they'
    when lower(btrim(coalesce(pr.gender, ''))) = 'male' then 'he'
    when lower(btrim(coalesce(pr.gender, ''))) = 'female' then 'she'
    else null
   260|  end
  into v_pronoun
  from public.profiles pr
  where pr.id = v_user_id;

  if v_pronoun is not null then
    v_stats := v_stats || jsonb_build_object('pronoun', v_pronoun);
  end if;

  v_value := public.checkin_stat_number(v_health, 'durationSec');
   270|  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('duration_sec', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'activeEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('active_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'totalEnergyKcal');
   280|  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('total_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'minHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_min', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'avgHrBpm');
   290|  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_avg', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'maxHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_max', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'distanceMeters');
   300|  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('distance_m', round(v_value));
  end if;

  -- Activity, label and pronoun alone are not a stats line. Checked before the card URL, the label and
  -- the trace are added, so a slot holding only a picture does not become a stats row.
  if v_stats - 'activity' - 'pronoun' = '{}'::jsonb then
    return null;
  end if;

   310|  if v_label is not null then
    v_stats := v_stats || jsonb_build_object('activity_label', v_label);
  end if;

  if v_card_url is not null then
    v_stats := v_stats || jsonb_build_object('card_url', v_card_url);
  end if;

  -- The trace, when the snapshot kept one. Copied onto the post rather than referenced, because the
  -- post is readable by people who cannot read the check-in behind it.
   320|  if jsonb_typeof(v_health -> 'hrSeries') = 'array'
     and jsonb_array_length(v_health -> 'hrSeries') > 0 then
    select jsonb_agg(round(t.value::numeric) order by t.ord)
      into v_series
    from jsonb_array_elements_text(v_health -> 'hrSeries') with ordinality as t(value, ord)
    where t.value ~ '^[0-9]+(\.[0-9]+)?$'
      and t.value::numeric between 20 and 260;

    if v_series is not null and jsonb_array_length(v_series) between 1 and 240 then
      v_stats := v_stats || jsonb_build_object('hr_series', v_series);
   330|    end if;
  end if;

  return v_stats;
end;
$$;

grant execute on function public.checkin_fitness_stats(uuid) to authenticated, service_role;

-- Posts whose check-in already stored a trace get it now. Nothing else changes: this recomputes from
   340|-- the same snapshot the previous version read.
update public.posts p
set checkin_stats = coalesce(public.checkin_fitness_stats(p.checkin_id), p.checkin_stats)
where p.checkin_id is not null
  and p.deleted_at is null
  and p.checkin_stats is not null;
