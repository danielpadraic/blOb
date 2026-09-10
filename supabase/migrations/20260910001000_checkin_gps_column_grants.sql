-- Private GPS columns on challenge_checkins.
--
-- Postgres ignores a column-level REVOKE while a table-level GRANT SELECT remains.
-- 20260827060000 revoked SELECT (location_lat, location_lng) but
-- 20260820120000 had already granted table-wide SELECT to authenticated, so
-- same-challenge members could still read submit-time coordinates. REPLICA
-- IDENTITY FULL plus Realtime publication broadcast the full row, including GPS.
--
-- Same pattern as 20260906000000_profiles_private_columns.sql: drop the table
-- SELECT grant, then grant every column except location_lat / location_lng.
-- INSERT/UPDATE table grants are left as they are; those two columns stay
-- ungranted to authenticated. Writes stay on SECURITY DEFINER check-in RPCs.
-- No GPS reader is added — the app does not select these columns today.
--
-- Apply by pasting this file in Supabase SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'challenge_checkins'
    and column_name not in ('location_lat', 'location_lng');

  revoke select on public.challenge_checkins from authenticated, anon;
  execute format(
    'grant select (%s) on public.challenge_checkins to authenticated',
    cols
  );
end $$;

revoke select (location_lat, location_lng) on public.challenge_checkins from anon, authenticated;
revoke insert (location_lat, location_lng) on public.challenge_checkins from anon, authenticated;
revoke update (location_lat, location_lng) on public.challenge_checkins from anon, authenticated;

-- PK is enough for Realtime filters. FULL was broadcasting GPS on every change.
alter table public.challenge_checkins replica identity default;

comment on column public.challenge_checkins.location_lat is
  'PRIVATE submit-time GPS. Owner write via RPC only. Not granted to authenticated SELECT.';
comment on column public.challenge_checkins.location_lng is
  'PRIVATE submit-time GPS. Owner write via RPC only. Not granted to authenticated SELECT.';

notify pgrst, 'reload schema';
