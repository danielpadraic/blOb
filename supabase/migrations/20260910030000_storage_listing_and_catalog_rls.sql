-- Slice 3: stop Storage prefix listing; lock advisor INFO tables.
-- Forward only. Does not DROP data.
-- Does not GRANT write_coin_ledger.
-- Does not revoke join_challenge / publish_challenge / send_coins.
--
-- Apply by pasting this file in SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.
-- Do not re-run 20260910000000 / 20260910001000 / 20260910020000.

-- ---------------------------------------------------------------------------
-- B. Storage listing
-- Public avatars / post-media CDN URLs do not need a bucket-wide SELECT.
-- Keep owner SELECT on own prefix so avatar upsert (INSERT+SELECT+UPDATE) still works.
-- Keep challenge-proofs participant SELECT (signed URLs).
-- Keep Official bug-report SELECT.
-- ---------------------------------------------------------------------------

drop policy if exists "Avatar images are publicly readable" on storage.objects;
drop policy if exists "Post media is publicly readable" on storage.objects;

drop policy if exists "Users read own avatar objects" on storage.objects;
create policy "Users read own avatar objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read own post media objects" on storage.objects;
create policy "Users read own post media objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- C. Advisor INFO tables
-- badges / bob_encouragement_catalog: catalog SELECT for signed-in only.
-- challenge_payouts: own row (user_id). No client writes.
-- challenge_disputes: people who can already see that challenge (user_can_access_challenge).
-- checkin_proof_locks: own check-in or participant. No client writes.
-- push_hook_config: service_role only. No authenticated/anon policies.
-- ---------------------------------------------------------------------------

alter table public.badges enable row level security;
alter table public.bob_encouragement_catalog enable row level security;
alter table public.challenge_payouts enable row level security;
alter table public.challenge_disputes enable row level security;
alter table public.checkin_proof_locks enable row level security;
alter table public.push_hook_config enable row level security;

-- badges: drop the open anon+authenticated catalog policy from 20260815_badges.sql
drop policy if exists "Anyone can read badges" on public.badges;
drop policy if exists select_authenticated on public.badges;
revoke insert, update, delete on table public.badges from anon, authenticated, public;
revoke select on table public.badges from anon, public;
grant select on table public.badges to authenticated;
create policy select_authenticated
  on public.badges
  for select
  to authenticated
  using (true);

grant select on table public.bob_encouragement_catalog to authenticated;
revoke insert, update, delete on table public.bob_encouragement_catalog from anon, authenticated, public;
revoke select on table public.bob_encouragement_catalog from anon, public;
drop policy if exists select_authenticated on public.bob_encouragement_catalog;
create policy select_authenticated
  on public.bob_encouragement_catalog
  for select
  to authenticated
  using (true);

-- payouts: drop using (true) from 20260815_settlement.sql
drop policy if exists "Payouts are readable" on public.challenge_payouts;
drop policy if exists select_authenticated on public.challenge_payouts;
revoke insert, update, delete on table public.challenge_payouts from anon, authenticated, public;
revoke select on table public.challenge_payouts from anon, public;
grant select on table public.challenge_payouts to authenticated;
create policy select_authenticated
  on public.challenge_payouts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists select_authenticated on public.challenge_disputes;
revoke insert, update, delete on table public.challenge_disputes from anon, authenticated, public;
revoke select on table public.challenge_disputes from anon, public;
grant select on table public.challenge_disputes to authenticated;
create policy select_authenticated
  on public.challenge_disputes
  for select
  to authenticated
  using (
    raised_by = auth.uid()
    or public.user_can_access_challenge(challenge_id)
  );

drop policy if exists select_authenticated on public.checkin_proof_locks;
grant select on table public.checkin_proof_locks to authenticated;
revoke insert, update, delete on table public.checkin_proof_locks from anon, authenticated, public;
revoke all on table public.checkin_proof_locks from anon, public;
create policy select_authenticated
  on public.checkin_proof_locks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.challenge_checkins ck
      where ck.id = checkin_proof_locks.checkin_id
        and ck.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.challenge_participants p
      where p.challenge_id = checkin_proof_locks.challenge_id
        and p.user_id = auth.uid()
    )
  );

revoke all on table public.push_hook_config from public, anon, authenticated;
grant select on table public.push_hook_config to service_role;
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_hook_config'
  loop
    execute format('drop policy if exists %I on public.push_hook_config', r.policyname);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verify (SQL Editor shows this last).
select
  'storage' as kind,
  pol.policyname,
  pol.cmd,
  pol.roles::text as roles
from pg_policies pol
where pol.schemaname = 'storage'
  and pol.tablename = 'objects'
  and pol.policyname in (
    'Avatar images are publicly readable',
    'Post media is publicly readable',
    'Users read own avatar objects',
    'Users read own post media objects',
    'Participants can read challenge proofs in storage',
    'Official read bug report images'
  )
union all
select
  'table' as kind,
  c.relname as policyname,
  case when c.relrowsecurity then 'rls' else 'no-rls' end as cmd,
  coalesce(
    (
      select string_agg(pol.policyname || ':' || pol.cmd, ', ' order by pol.policyname)
      from pg_policies pol
      where pol.schemaname = 'public' and pol.tablename = c.relname
    ),
    'left locked'
  ) as roles
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'badges',
    'bob_encouragement_catalog',
    'challenge_payouts',
    'challenge_disputes',
    'checkin_proof_locks',
    'push_hook_config'
  )
order by kind, policyname;
