-- blOb ops — Stamp honor recap stats on LIVE Pinnacle check-in posts
-- “Rookies vs. Veterans” (private_corporate)
--
-- WHAT THIS DOES
--   For each submitted honor log on the LIVE room that has numbers and no
--   honor_card mark: write posts.checkin_stats from stored metric_values +
--   scoring_config (activities, multiplier, money, lane).
--   Does not invent counts. Does not touch user media_urls.
--   The app draws the recap card from these fields (and uploads a JPEG on
--   the next new / same-day log).
--
-- TARGET
--   title = 'Rookies vs. Veterans'
--   privacy_mode = private_corporate
--   status = live
--   NOT 'TEST — Rookies vs. Veterans'
--   NOT 8fce711b
--
-- Do not supabase db push --include-all.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- Cursor already ran SCRIPT B. SCRIPT C is optional proof.
--
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. Blank box + green Run.
-- 3. Open artifacts/ops_pinnacle_honor_card_backfill.sql in Cursor
-- 4. SCRIPT C only: select from “-- SCRIPT C” to the end. Copy (Cmd+C).
-- 5. Paste in Supabase, click green Run.
--    If it offers “Run without RLS”, click Cancel.
-- 6. DONE WHEN you see one live row with source honor_card and
--    test_clone_checkins unchanged.


-- =============================================================================
-- SCRIPT A — preview (read only)
-- =============================================================================
with live as (
  select c.id, c.title, c.scoring_config, c.timezone
  from public.challenges c
  where c.title = 'Rookies vs. Veterans'
    and c.title <> 'TEST — Rookies vs. Veterans'
    and c.privacy_mode = 'private_corporate'
    and c.id <> '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
    and c.status = 'live'
), scanned as (
  select
    ck.id as checkin_id,
    p.id as post_id,
    ck.metric_values,
    p.checkin_stats,
    p.media_urls,
    case
      when ck.metric_values is null or ck.metric_values = '{}'::jsonb then 'no_numbers'
      when coalesce(p.checkin_stats->>'source', '') = 'honor_card' then 'has_card'
      else 'needs_card'
    end as verdict
  from public.challenge_checkins ck
  join live on live.id = ck.challenge_id
  left join public.posts p
    on p.checkin_id = ck.id
   and p.deleted_at is null
  where ck.status = 'submitted' or ck.submitted_at is not null
)
select
  (select count(*) from live) as live_challenges,
  (select id from live) as challenge_id,
  (select count(*) from scanned) as logs_scanned,
  (select count(*) from scanned where verdict = 'needs_card') as cards_to_write,
  (select count(*) from scanned where verdict = 'no_numbers') as skipped_no_numbers,
  (select count(*) from scanned where verdict = 'has_card') as already_marked,
  (select count(*) from public.challenge_checkins ck
    where ck.challenge_id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05') as test_clone_checkins;


-- =============================================================================
-- SCRIPT B — apply (one live room, stats only)
-- =============================================================================
with live as (
  select c.id, c.title, c.scoring_config, c.timezone
  from public.challenges c
  where c.title = 'Rookies vs. Veterans'
    and c.title <> 'TEST — Rookies vs. Veterans'
    and c.privacy_mode = 'private_corporate'
    and c.id <> '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
    and c.status = 'live'
), form as (
  select
    live.id as challenge_id,
    live.title,
    live.timezone,
    act.ord,
    act.key,
    act.label,
    act.kind,
    act.chip_label,
    act.icon_key
  from live
  cross join lateral (
    select
      a.ord * 2 as ord,
      a.item->>'id' as key,
      a.item->>'name' as label,
      case when a.item->>'input_kind' = 'money' then 'money' else 'count' end as kind,
      a.item->>'name' as chip_label,
      case
        when lower(a.item->>'name') ~ 'dial|call|phone' then 'calls'
        when lower(a.item->>'name') ~ 'ap|premium|money|usd' then 'money'
        else 'generic'
      end as icon_key
    from jsonb_array_elements(coalesce(live.scoring_config->'activities', '[]'::jsonb)) with ordinality as a(item, ord)
    union all
    select
      a.ord * 2 + 1,
      'multiplier:' || regexp_replace(lower(btrim(a.item#>>'{multiplier,label}')), '[^a-z0-9]+', '-', 'g'),
      a.item#>>'{multiplier,label}',
      'count',
      case
        when lower(a.item#>>'{multiplier,label}') in ('presentations', 'presentation') then 'Pres'
        else a.item#>>'{multiplier,label}'
      end,
      'presentation'
    from jsonb_array_elements(coalesce(live.scoring_config->'activities', '[]'::jsonb)) with ordinality as a(item, ord)
    where coalesce((a.item#>>'{multiplier,enabled}')::boolean, false)
      and btrim(coalesce(a.item#>>'{multiplier,label}', '')) <> ''
  ) as act
), stamped as (
  select
    p.id as post_id,
    ck.id as checkin_id,
    jsonb_build_object(
      'source', 'honor_card',
      'challenge_title', live.title,
      'scoring_lane', cp.scoring_lane,
      'lane_label', coalesce(lane.lbl, initcap(cp.scoring_lane)),
      'period_label', to_char(ck.period_key::date, 'Dy, Mon FMDD'),
      'card_url', null,
      'honor_fields', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'key', f.key,
            'label', f.label,
            'chip_label', f.chip_label,
            'value', coalesce((ck.metric_values ->> f.key)::numeric, 0),
            'kind', f.kind,
            'icon_key', f.icon_key
          )
          order by f.ord
        )
        from form f
        where f.challenge_id = live.id
      ), '[]'::jsonb)
    ) as next_stats
  from public.challenge_checkins ck
  join live on live.id = ck.challenge_id
  join public.posts p on p.checkin_id = ck.id and p.deleted_at is null
  left join public.challenge_participants cp
    on cp.challenge_id = ck.challenge_id
   and cp.user_id = ck.user_id
  left join lateral (
    select coalesce(nullif(btrim(l->>'name'), ''), nullif(btrim(l->>'label'), '')) as lbl
    from jsonb_array_elements(coalesce(live.scoring_config->'lanes', '[]'::jsonb)) as l
    where l->>'id' = cp.scoring_lane
    limit 1
  ) lane on true
  where (ck.status = 'submitted' or ck.submitted_at is not null)
    and ck.metric_values is not null
    and ck.metric_values <> '{}'::jsonb
    and coalesce(p.checkin_stats->>'source', '') is distinct from 'honor_card'
)
update public.posts p
set checkin_stats = s.next_stats
from stamped s
where p.id = s.post_id
returning p.id, p.checkin_id, p.checkin_stats->>'source' as source;


-- =============================================================================
-- SCRIPT C — confirm
-- =============================================================================
with live as (
  select c.id
  from public.challenges c
  where c.title = 'Rookies vs. Veterans'
    and c.title <> 'TEST — Rookies vs. Veterans'
    and c.privacy_mode = 'private_corporate'
    and c.id <> '8fce711b-03a5-45e5-b5e8-272c6b3e9a05'
    and c.status = 'live'
)
select
  (select id from live) as challenge_id,
  count(*) filter (where ck.status = 'submitted' or ck.submitted_at is not null) as logs_scanned,
  count(*) filter (
    where (ck.status = 'submitted' or ck.submitted_at is not null)
      and coalesce(p.checkin_stats->>'source', '') = 'honor_card'
  ) as cards_written,
  count(*) filter (
    where (ck.status = 'submitted' or ck.submitted_at is not null)
      and (ck.metric_values is null or ck.metric_values = '{}'::jsonb)
  ) as skipped_no_numbers,
  (select count(*) from public.challenge_checkins t
    where t.challenge_id = '8fce711b-03a5-45e5-b5e8-272c6b3e9a05') as test_clone_checkins,
  bool_and(coalesce(p.audience, '') = 'challenge_only' or p.id is null) as corporate_contained
from public.challenge_checkins ck
join live on live.id = ck.challenge_id
left join public.posts p on p.checkin_id = ck.id and p.deleted_at is null;
