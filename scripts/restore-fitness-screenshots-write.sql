-- WRITE. Run AFTER the preview. Does not delete challenge_checkins.
-- Does not touch HealthKit / Health Connect / healthWorkoutId slots.
--
-- 1. Drop card_url when it names a JPEG/HEIC screenshot (OCR still painted over as the recap).
-- 2. Re-attach proof_parts screenshot URLs before any PNG recap in posts.media_urls.
-- 3. If the slot url is the PNG and urls[] still has the JPEG, put the JPEG back as url.
--
-- Paste in Supabase → SQL Editor (project tguzdtwsajnnczdxjqyq) and click Run.

with live_posts as (
  select distinct on (p.checkin_id)
    p.id as post_id,
    p.checkin_id,
    p.media_urls,
    p.checkin_stats
  from public.posts p
  where p.checkin_id is not null
    and p.deleted_at is null
  order by p.checkin_id, p.created_at asc, p.id asc
),
ocr_parts as (
  select
    cc.id as checkin_id,
    kv.key as slot_id,
    kv.value as part
  from public.challenge_checkins cc
  join public.challenges ch on ch.id = cc.challenge_id
  cross join lateral jsonb_each(coalesce(cc.proof_parts, '{}'::jsonb)) kv
  where lower(trim(coalesce(
      kv.value->>'method',
      (
        select pr->>'method'
        from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) pr
        where pr->>'id' = kv.key
        limit 1
      ),
      ''
    ))) in ('hr', 'distance')
    and coalesce(kv.value->>'healthWorkoutId', '') = ''
    and coalesce(kv.value->'health'->>'source', '') not in ('healthkit', 'health_connect')
    and not (
      nullif(trim(coalesce(kv.value->'health'->>'source', '')), '') is null
      and nullif(trim(coalesce(kv.value->'health'->>'startedAt', '')), '') is not null
      and nullif(trim(coalesce(kv.value->'health'->>'endedAt', '')), '') is not null
    )
),
flat_urls as (
  select
    op.checkin_id,
    trim(u.url) as url
  from ocr_parts op
  cross join lateral (
    select coalesce(nullif(trim(op.part->>'url'), ''), '') as url
    union all
    select trim(elem #>> '{}')
    from jsonb_array_elements(coalesce(op.part->'urls', '[]'::jsonb)) elem
    where jsonb_typeof(elem) = 'string'
    union all
    select trim(elem->>'url')
    from jsonb_array_elements(coalesce(op.part->'urls', '[]'::jsonb)) elem
    where jsonb_typeof(elem) = 'object'
  ) u
  where trim(u.url) <> ''
    and trim(u.url) not like 'health:%'
),
checkin_stills as (
  select
    fu.checkin_id,
    public.checkin_unique_urls(coalesce(array_agg(fu.url) filter (
      where lower(split_part(fu.url, '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
    ), '{}'::text[])) as stills,
    public.checkin_unique_urls(coalesce(array_agg(fu.url) filter (
      where lower(split_part(fu.url, '?', 1)) ~* '\.png$'
    ), '{}'::text[])) as cards
  from flat_urls fu
  group by fu.checkin_id
),
planned as (
  select
    lp.post_id,
    lp.checkin_id,
    lp.media_urls,
    public.checkin_unique_urls(
      coalesce(cs.stills, '{}'::text[])
      || coalesce((
        select array_agg(m.url order by m.ord)
        from unnest(coalesce(lp.media_urls, '{}'::text[])) with ordinality as m(url, ord)
        where coalesce(m.url, '') <> ''
          and lower(split_part(m.url, '?', 1)) !~* '\.png$'
          and not exists (
            select 1
            from unnest(coalesce(cs.stills, '{}'::text[])) x(url)
            where lower(split_part(x.url, '?', 1)) = lower(split_part(m.url, '?', 1))
          )
      ), '{}'::text[])
      || coalesce(cs.cards, '{}'::text[])
      || coalesce((
        select array_agg(m.url order by m.ord)
        from unnest(coalesce(lp.media_urls, '{}'::text[])) with ordinality as m(url, ord)
        where lower(split_part(m.url, '?', 1)) ~* '\.png$'
          and not exists (
            select 1
            from unnest(coalesce(cs.cards, '{}'::text[])) x(url)
            where lower(split_part(x.url, '?', 1)) = lower(split_part(m.url, '?', 1))
          )
      ), '{}'::text[])
    ) as next_media,
    (
      nullif(trim(lp.checkin_stats->>'card_url'), '') is not null
      and lower(split_part(lp.checkin_stats->>'card_url', '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
    ) as drop_card_url
  from live_posts lp
  left join checkin_stills cs on cs.checkin_id = lp.checkin_id
  where exists (select 1 from ocr_parts op where op.checkin_id = lp.checkin_id)
)
update public.posts p
set
  media_urls = pl.next_media,
  checkin_stats = case
    when pl.drop_card_url then coalesce(p.checkin_stats, '{}'::jsonb) - 'card_url'
    else p.checkin_stats
  end
from planned pl
where p.id = pl.post_id
  and (
    pl.drop_card_url
    or p.media_urls is distinct from pl.next_media
  );

with ocr_parts as (
  select
    cc.id as checkin_id,
    kv.key as slot_id,
    kv.value as part
  from public.challenge_checkins cc
  join public.challenges ch on ch.id = cc.challenge_id
  cross join lateral jsonb_each(coalesce(cc.proof_parts, '{}'::jsonb)) kv
  where lower(trim(coalesce(
      kv.value->>'method',
      (
        select pr->>'method'
        from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) pr
        where pr->>'id' = kv.key
        limit 1
      ),
      ''
    ))) in ('hr', 'distance')
    and coalesce(kv.value->>'healthWorkoutId', '') = ''
    and coalesce(kv.value->'health'->>'source', '') not in ('healthkit', 'health_connect')
    and not (
      nullif(trim(coalesce(kv.value->'health'->>'source', '')), '') is null
      and nullif(trim(coalesce(kv.value->'health'->>'startedAt', '')), '') is not null
      and nullif(trim(coalesce(kv.value->'health'->>'endedAt', '')), '') is not null
    )
),
fixed_parts as (
  select
    op.checkin_id,
    op.slot_id,
    case
      when lower(split_part(coalesce(op.part->>'url', ''), '?', 1)) ~* '\.png$'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(op.part->'urls', '[]'::jsonb)) elem
          where (
            jsonb_typeof(elem) = 'string'
            and lower(split_part(elem #>> '{}', '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
          ) or (
            jsonb_typeof(elem) = 'object'
            and lower(split_part(elem->>'url', '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
          )
        )
      then op.part || jsonb_build_object(
        'url',
        coalesce(
          (
            select elem #>> '{}'
            from jsonb_array_elements(coalesce(op.part->'urls', '[]'::jsonb)) elem
            where jsonb_typeof(elem) = 'string'
              and lower(split_part(elem #>> '{}', '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
            limit 1
          ),
          (
            select elem->>'url'
            from jsonb_array_elements(coalesce(op.part->'urls', '[]'::jsonb)) elem
            where jsonb_typeof(elem) = 'object'
              and lower(split_part(elem->>'url', '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
            limit 1
          )
        )
      )
      else op.part
    end as part
  from ocr_parts op
)
update public.challenge_checkins cc
set proof_parts = cc.proof_parts || coalesce((
  select jsonb_object_agg(fp.slot_id, fp.part)
  from fixed_parts fp
  where fp.checkin_id = cc.id
    and fp.part is distinct from (cc.proof_parts -> fp.slot_id)
), '{}'::jsonb)
where exists (
  select 1 from fixed_parts fp
  where fp.checkin_id = cc.id
    and fp.part is distinct from (cc.proof_parts -> fp.slot_id)
);

-- Remaining card-only OCR posts: screenshot object is gone or never stored as a URL.
select
  p.id as post_id,
  coalesce(array_length(p.media_urls, 1), 0) as media_urls_count,
  true as unrestorable,
  'object_replaced' as reason
from public.posts p
join public.challenge_checkins cc on cc.id = p.checkin_id
where p.deleted_at is null
  and exists (
    select 1
    from jsonb_each(coalesce(cc.proof_parts, '{}'::jsonb)) kv
    where lower(trim(coalesce(kv.value->>'method', ''))) in ('hr', 'distance')
      and coalesce(kv.value->>'healthWorkoutId', '') = ''
      and coalesce(kv.value->'health'->>'source', '') not in ('healthkit', 'health_connect')
  )
  and coalesce(array_length(p.media_urls, 1), 0) > 0
  and not exists (
    select 1
    from unnest(coalesce(p.media_urls, '{}'::text[])) m(url)
    where lower(split_part(m.url, '?', 1)) ~* '\.(jpe?g|heic|heif|webp)$'
  )
  and (
    nullif(trim(p.checkin_stats->>'card_url'), '') is not null
    or exists (
      select 1
      from unnest(coalesce(p.media_urls, '{}'::text[])) m(url)
      where lower(split_part(m.url, '?', 1)) ~* '\.png$'
    )
  );
