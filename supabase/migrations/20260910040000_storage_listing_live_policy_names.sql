-- Slice 3 follow-up: live listing policies used different names than schema.sql.
-- Forward only. Does not DROP data or buckets.
-- Does not GRANT write_coin_ledger.
-- Does not revoke join_challenge / publish_challenge / send_coins.
--
-- Live SELECT names (2026-09-10):
--   "Anyone can view post media"              {public}   <- listing, drop
--   "Avatar images are publicly accessible"     {public}   <- listing, drop
--   "Authenticated can view challenge proofs" {authenticated}
--   "Challenge participants can view proofs"  {authenticated}
-- Public CDN URLs for avatars / post-media do not need a bucket-wide SELECT.
-- Keep owner prefix SELECT (upsert). Keep scoped challenge-proofs SELECT (signed URLs).
--
-- Apply by pasting this file in SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.
-- Do not re-run 20260910000000 / 20260910001000 / 20260910020000 / 20260910030000.

drop policy if exists "Anyone can view post media" on storage.objects;
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Avatar images are publicly readable" on storage.objects;
drop policy if exists "Post media is publicly readable" on storage.objects;

-- Drop leftover SELECT that is only bucket_id (prefix listing), not a single-object grant.
do $$
declare
  r record;
  q text;
begin
  for r in
    select policyname, coalesce(qual, '') as using_expr
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'SELECT'
  loop
    q := r.using_expr;
    if q ~* 'bucket_id = ''avatars'''
       and q !~* 'foldername'
    then
      execute format('drop policy if exists %I on storage.objects', r.policyname);
    elsif q ~* 'bucket_id = ''post-media'''
       and q !~* 'foldername'
    then
      execute format('drop policy if exists %I on storage.objects', r.policyname);
    elsif q ~* 'bucket_id = ''challenge-proofs'''
       and q !~* 'foldername'
       and q !~* 'is_challenge_participant'
    then
      execute format('drop policy if exists %I on storage.objects', r.policyname);
    end if;
  end loop;
end $$;

-- One scoped proofs SELECT. Path is {user_id}/{challenge_id}/filename (schema.sql).
drop policy if exists "Challenge participants can view proofs" on storage.objects;
drop policy if exists "Participants can read challenge proofs in storage" on storage.objects;
drop policy if exists "Authenticated can view challenge proofs" on storage.objects;
create policy "Challenge participants can view proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'challenge-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_challenge_participant(((storage.foldername(name))[2])::uuid, auth.uid())
    )
  );

notify pgrst, 'reload schema';

-- Verify (SQL Editor shows this last).
select policyname, cmd, roles::text as roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd = 'SELECT'
order by policyname;
