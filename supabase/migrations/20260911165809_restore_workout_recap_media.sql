-- Restore the generated HealthKit / Health Connect recap JPEG as an EXTRA last slide.
-- Does not delete challenge_checkins. Does not touch Prayer honor rows.
-- Does not rewrite HealthKit snapshots. One Live post per checkin_id.
--
-- Paste this whole file in Supabase → SQL Editor (project blOb-app / tguzdtwsajnnczdxjqyq)
-- and click Run. The last table is the backfill count.

-- Recap vs selfie: workout_card- upload path, or the named vendor card_url (query ignored).
create or replace function public.checkin_is_recap_url(p_url text, p_card_url text default null)
returns boolean
language sql
immutable
as $$
  select
    coalesce(nullif(btrim(p_url), ''), '') <> ''
    and btrim(p_url) not like 'health:%'
    and (
      lower(split_part(p_url, '?', 1)) ~* '/workout_card-[0-9]+\.(jpe?g|png|webp)$'
      or (
        coalesce(nullif(btrim(p_card_url), ''), '') <> ''
        and btrim(p_card_url) not like 'health:%'
        and lower(split_part(p_url, '?', 1)) = lower(split_part(p_card_url, '?', 1))
      )
    );
$$;

comment on function public.checkin_is_recap_url(text, text) is
  'Recap JPEG: workout_card- path or named card_url. Selfies / screenshots / extras return false.';

grant execute on function public.checkin_is_recap_url(text, text) to authenticated, service_role;

create or replace function public.checkin_media_stills_then_recap(p_urls text[], p_card_url text default null)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_stills text[] := '{}';
  v_cards text[] := '{}';
  v_url text;
  v_recap text;
begin
  foreach v_url in array coalesce(p_urls, '{}')
  loop
    if coalesce(nullif(btrim(v_url), ''), '') = '' or v_url like 'health:%' then
      continue;
    end if;
    if public.checkin_is_recap_url(v_url, p_card_url) then
      v_cards := v_cards || v_url;
    else
      v_stills := v_stills || v_url;
    end if;
  end loop;

  v_recap := coalesce(
    (
      select c.u
      from unnest(v_cards) as c(u)
      where p_card_url is not null
        and lower(split_part(c.u, '?', 1)) = lower(split_part(p_card_url, '?', 1))
      limit 1
    ),
    v_cards[1],
    case
      when coalesce(nullif(btrim(p_card_url), ''), '') <> ''
        and p_card_url not like 'health:%'
      then p_card_url
      else null
    end
  );

  if v_recap is null then
    return public.checkin_unique_urls(v_stills);
  end if;
  return public.checkin_unique_urls(v_stills || array[v_recap]);
end;
$$;

grant execute on function public.checkin_media_stills_then_recap(text[], text) to authenticated, service_role;

-- Stills (required + extras) first. Vendor slot primary URL last when it is the recap.
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
  v_part_url text;
begin
  for v_elem in
    select value from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb))
  loop
    v_id := coalesce(v_elem->>'id', v_elem->>'method');
    v_part := coalesce(p_parts -> v_id, '{}'::jsonb);
    v_vendor :=
      nullif(btrim(coalesce(v_part->>'healthWorkoutId', '')), '') is not null
      or coalesce(v_part -> 'health' ->> 'source', '') in ('healthkit', 'health_connect');
    v_part_url := coalesce(nullif(btrim(v_part->>'url'), ''), '');

    v_url := v_part_url;
    if v_url <> '' and v_url not like 'health:%' then
      if v_vendor or public.checkin_is_recap_url(v_url, null) then
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
        if public.checkin_is_recap_url(v_url, null)
           or (v_vendor and v_part_url <> '' and v_url = v_part_url) then
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
      if public.checkin_is_recap_url(v_url, v_cards[1]) then
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

-- Keep stills already on the post when a proof write arrives. Card last. Never blank selfies.
create or replace function public.post_checkin_stage(
  p_user_id uuid,
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_content text,
  p_media text[],
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_media text[] := '{}';
  v_existing text[] := '{}';
  v_stats jsonb;
  v_card text;
begin
  select id, media_urls
    into v_id, v_existing
  from public.posts
  where checkin_id = p_checkin_id
    and deleted_at is null
  order by created_at asc, id asc
  limit 1;

  v_stats := public.checkin_fitness_stats(p_checkin_id);
  v_card := nullif(btrim(coalesce(v_stats->>'card_url', '')), '');
  v_media := public.checkin_media_stills_then_recap(
    coalesce(v_existing, '{}') || coalesce(p_media, '{}'),
    v_card
  );

  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(v_media, 1), 0) = 0 then
    return;
  end if;

  if v_id is not null then
    update public.posts
    set
      content = coalesce(nullif(btrim(p_content), ''), content),
      media_urls = v_media,
      checkin_stage = p_stage,
      source = 'checkin',
      challenge_id = coalesce(challenge_id, p_challenge_id),
      checkin_stats = coalesce(v_stats, checkin_stats)
    where id = v_id;
    return;
  end if;

  insert into public.posts (
    author_id,
    challenge_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    checkin_id,
    checkin_stage,
    source,
    checkin_stats
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    v_media,
    'public',
    '{}',
    p_checkin_id,
    p_stage,
    'checkin',
    v_stats
  );
end;
$$;

-- Replace only the recap URL. Keep slot stills / extras. Union existing post stills.
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
      if v_item = v_old_url or v_item = p_url or public.checkin_is_recap_url(v_item, p_url) then
        continue;
      end if;
      v_kept := v_kept || v_item;
    end loop;
  end if;
  if v_old_url <> ''
     and v_old_url not like 'health:%'
     and v_old_url is distinct from p_url
     and not public.checkin_is_recap_url(v_old_url, p_url)
     and v_old_url <> coalesce(c.pre_selfie_url, '')
     and v_old_url <> coalesce(c.post_selfie_url, '') then
    -- Old slot url that is a still (not the previous recap) stays.
    if not public.checkin_is_recap_url(v_old_url, null) then
      v_kept := v_kept || v_old_url;
    end if;
  end if;

  v_part := v_part || jsonb_build_object(
    'url', p_url,
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
        when v_is_hr and (hr_monitor_url is null or hr_monitor_url = v_old_url or public.checkin_is_recap_url(hr_monitor_url, v_old_url))
          then p_url
        else hr_monitor_url
      end,
      pre_selfie_url = case
        when v_old_url <> '' and pre_selfie_url = v_old_url then p_url
        else pre_selfie_url
      end,
      post_selfie_url = case
        when v_old_url <> '' and post_selfie_url = v_old_url then p_url
        else post_selfie_url
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
        and t.u is distinct from v_old_url
        and not public.checkin_is_recap_url(t.u, p_url)
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

-- Backfill: append a stored vendor recap JPEG. Restore stills if the post is card-only.
-- One row per checkin_id. Honor / Prayer (no vendor health) are not selected.
with live_posts as (
  select distinct on (p.checkin_id)
    p.id as post_id,
    p.checkin_id,
    p.challenge_id,
    p.media_urls,
    p.checkin_stats
  from public.posts p
  where p.checkin_id is not null
    and p.deleted_at is null
  order by p.checkin_id, p.created_at asc, p.id asc
),
vendor_card as (
  select distinct on (cc.id)
    cc.id as checkin_id,
    nullif(btrim(kv.value->>'url'), '') as part_url
  from public.challenge_checkins cc
  cross join lateral jsonb_each(coalesce(cc.proof_parts, '{}'::jsonb)) kv
  where jsonb_typeof(kv.value -> 'health') = 'object'
    and (
      nullif(btrim(coalesce(kv.value->>'healthWorkoutId', '')), '') is not null
      or coalesce(kv.value -> 'health' ->> 'source', '') in ('healthkit', 'health_connect')
    )
    and nullif(btrim(coalesce(kv.value->>'url', '')), '') is not null
    and kv.value->>'url' not like 'health:%'
  order by
    cc.id,
    (lower(split_part(kv.value->>'url', '?', 1)) ~* '/workout_card-[0-9]+') desc,
    coalesce(kv.value->>'cardVersion', '') desc
),
planned as (
  select
    lp.post_id,
    lp.checkin_id,
    lp.challenge_id,
    public.checkin_media_stills_then_recap(
      public.checkin_proof_media_urls(ch, c.proof_parts, c)
      || coalesce((
        select array_agg(t.u order by t.ord)
        from unnest(coalesce(lp.media_urls, '{}'::text[])) with ordinality as t(u, ord)
        where coalesce(t.u, '') <> ''
          and t.u not like 'health:%'
      ), '{}'::text[]),
      coalesce(
        nullif(btrim(lp.checkin_stats->>'card_url'), ''),
        vc.part_url
      )
    ) as next_media,
    case
      when nullif(btrim(coalesce(lp.checkin_stats->>'card_url', '')), '') is null
        and vc.part_url is not null
      then coalesce(lp.checkin_stats, '{}'::jsonb) || jsonb_build_object('card_url', vc.part_url)
      else lp.checkin_stats
    end as next_stats
  from live_posts lp
  join public.challenge_checkins c on c.id = lp.checkin_id
  join public.challenges ch on ch.id = c.challenge_id
  join vendor_card vc on vc.checkin_id = lp.checkin_id
  where (
    coalesce((lp.checkin_stats->>'duration_sec')::numeric, 0) > 0
    or coalesce((lp.checkin_stats->>'active_cal')::numeric, 0) > 0
    or coalesce((lp.checkin_stats->>'total_cal')::numeric, 0) > 0
    or coalesce((lp.checkin_stats->>'hr_avg')::numeric, 0) > 0
    or coalesce((lp.checkin_stats->>'distance_m')::numeric, 0) > 0
  )
),
updated as (
  update public.posts p
  set
    media_urls = pl.next_media,
    checkin_stats = coalesce(pl.next_stats, p.checkin_stats)
  from planned pl
  where p.id = pl.post_id
    and (
      p.media_urls is distinct from pl.next_media
      or p.checkin_stats is distinct from pl.next_stats
    )
  returning p.id, p.challenge_id, p.checkin_id
)
select
  count(*) filter (where ch.title ilike '%30-day consistency%') as thirty_day_updated,
  count(*) as all_vendor_updated
from updated u
left join public.challenges ch on ch.id = u.challenge_id;
