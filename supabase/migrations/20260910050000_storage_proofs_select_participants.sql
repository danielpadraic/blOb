-- Slice 3 follow-up: restore scoped challenge-proofs SELECT without
-- public.is_challenge_participant (that function is not on live).
-- 20260910040000 failed at CREATE POLICY; paste this file instead.
-- Do not re-run 20260910040000 / 20260910030000 / 20260910020000 /
-- 20260910000000 / 20260910001000.
--
-- Live participant check (20260909140000): exists on challenge_participants.
-- Proof path is {user_id}/{challenge_id}/filename (schema.sql / upload.ts).
-- Public CDN avatars / post-media do not need bucket-wide SELECT.
--
-- Apply by pasting this file in SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.
-- Does not DROP data. Does not GRANT write_coin_ledger.

drop policy if exists "Anyone can view post media" on storage.objects;
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Avatar images are publicly readable" on storage.objects;
drop policy if exists "Post media is publicly readable" on storage.objects;

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
      or exists (
        select 1
        from public.challenge_participants p
        where p.user_id = auth.uid()
          and p.challenge_id::text = (storage.foldername(name))[2]
      )
    )
  );

notify pgrst, 'reload schema';

select policyname, cmd, roles::text as roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd = 'SELECT'
order by policyname;
