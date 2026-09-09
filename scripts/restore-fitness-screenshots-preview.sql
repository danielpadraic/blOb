-- PREVIEW ONLY. No writes.
--
-- Fitness / HR / distance check-in posts where the generated recap ate the user screenshot.
-- Paste in Supabase → SQL Editor (project tguzdtwsajnnczdxjqyq) and click Run.
-- HealthKit / Health Connect slots are listed separately and are NOT restored.

with live_posts as (
  select distinct on (p.checkin_id)
    p.id as post_id,
    p.checkin_id,
    p.media_urls,
    p.checkin_stats,
    p.created_at
  from public.posts p
  where p.checkin_id is not null
    and p.deleted_at is null
  order by p.checkin_id, p.created_at asc, p.id asc
),
part_urls as (
  select
    cc.id as checkin_id,
    cc.user_id,
    cc.challenge_id,
    kv.key as slot_id,
    kv.value as part,
    lower(trim(coalesce(
      kv.value->>'method',
      (
        select pr->>'method'
        from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) pr
        where pr->>'id' = kv.key
        limit 1
      ),
      ''
    ))) as slot_method,
    coalesce(kv.value->>'healthWorkoutId', '') <> ''
      or coalesce(kv.value->'health'->>'source', '') in ('healthkit', 'health_connect')
      or (
        nullif(trim(coalesce(kv.value->'health'->>'source', '')), '') is null
        and nullif(trim(coalesce(kv.value->'health'->>'startedAt', '')), '') is not null
        and nullif(trim(coalesce(kv.value->'health'->>'endedAt', '')), '') is not null
      ) as is_vendor,
    coalesce(kv.value->'health'->>'source', '') as health_source
  from public.challenge_checkins cc
  join public.challenges ch on ch.id = cc.challenge_id
  cross join lateral jsonb_each(coalesce(cc.proof_parts, '{}'::jsonb)) kv
),
flat_urls as (
  select
    pu.checkin_id,
    pu.slot_id,
    pu.is_vendor,
    pu.health_source,
    pu.slot_method,
    trim(u.url) as url
  from part_urls pu
  cross join lateral (
    select coalesce(nullif(trim(pu.part->>'url'), ''), '') as url
    union all
    select trim(elem #>> '{}')
    from jsonb_array_elements(coalesce(pu.part->'urls', '[]'::jsonb)) elem
    where jsonb_typeof(elem) = 'string'
    union all
    select trim(elem->>'url')
    from jsonb_array_elements(coalesce(pu.part->'urls', '[]'::jsonb)) elem
    where jsonb_typeof(elem) = 'object'
  ) u
  where trim(u.url) <> ''
    and trim(u.url) not like 'health:%'
),
post_media as (
  select
    lp.post_id,
    lp.checkin_id,
    lp.media_urls,
    coalesce(array_length(lp.media_urls, 1), 0) as media_count,
    nullif(trim(lp.checkin_stats->>'card_url'), '') as card_url,
    m.url as media_url,
    lower(split_part(m.url, '?', 1)) as media_path
  from live_posts lp
  left join lateral unnest(coalesce(lp.media_urls, '{}'::text[])) m(url) on true
),
ocr_slots as (
  select *
  from part_urls
  where slot_method in ('hr', 'distance')
    and not is_vendor
),
preview as (
  select
    lp.post_id,
    lp.checkin_id,
    coalesce(array_length(lp.media_urls, 1), 0) as media_urls_count,
    exists (
      select 1
      from unnest(coalesce(lp.media_urls, '{}'::text[])) m(url)
      where lower(split_part(m.url, '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
    ) as has_non_card_still,
    exists (
      select 1
      from unnest(coalesce(lp.media_urls, '{}'::text[])) m(url)
      where lower(split_part(m.url, '?', 1)) ~* '\.png$'
         or (
           nullif(trim(lp.checkin_stats->>'card_url'), '') is not null
           and lower(split_part(m.url, '?', 1)) = lower(split_part(lp.checkin_stats->>'card_url', '?', 1))
         )
    ) as has_generated_card,
    (
      select count(*)::int
      from flat_urls fu
      join ocr_slots os on os.checkin_id = fu.checkin_id and os.slot_id = fu.slot_id
      where fu.checkin_id = lp.checkin_id
        and lower(split_part(fu.url, '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
        and not exists (
          select 1
          from unnest(coalesce(lp.media_urls, '{}'::text[])) m(url)
          where lower(split_part(m.url, '?', 1)) = lower(split_part(fu.url, '?', 1))
        )
    ) as proof_stills_missing_from_media,
    case
      when exists (
        select 1 from ocr_slots os where os.checkin_id = lp.checkin_id
      )
      and coalesce(array_length(lp.media_urls, 1), 0) > 0
      and not exists (
        select 1
        from unnest(coalesce(lp.media_urls, '{}'::text[])) m(url)
        where lower(split_part(m.url, '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
      )
      and (
        nullif(trim(lp.checkin_stats->>'card_url'), '') is not null
        or exists (
          select 1
          from unnest(coalesce(lp.media_urls, '{}'::text[])) m(url)
          where lower(split_part(m.url, '?', 1)) ~* '\.png$'
        )
      )
      then true
      else false
    end as card_only,
    case
      when exists (
        select 1 from ocr_slots os where os.checkin_id = lp.checkin_id
      )
      and nullif(trim(lp.checkin_stats->>'card_url'), '') is not null
      and lower(split_part(lp.checkin_stats->>'card_url', '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
      then true
      else false
    end as jpeg_named_as_card,
    (
      select string_agg(distinct os.health_source, ',')
      from ocr_slots os
      where os.checkin_id = lp.checkin_id
    ) as health_source
  from live_posts lp
  where exists (select 1 from ocr_slots os where os.checkin_id = lp.checkin_id)
)
select
  post_id,
  media_urls_count,
  has_non_card_still,
  has_generated_card,
  proof_stills_missing_from_media,
  card_only,
  jpeg_named_as_card,
  health_source,
  case
    when jpeg_named_as_card then 'drop_card_url'
    when proof_stills_missing_from_media > 0 then 'restore_from_proof_parts'
    when card_only then 'object_replaced_or_storage_only'
    else 'ok'
  end as plan
from preview
where jpeg_named_as_card
   or proof_stills_missing_from_media > 0
   or card_only
order by card_only desc, jpeg_named_as_card desc, post_id;
