-- Advisor: SELECT policies on catalog / payout INFO tables.
-- Does not change DEFINER EXECUTE grants.
-- Does not GRANT write_coin_ledger / tick_settlements / settle_ended_challenge /
-- wipe_user_challenge_progress.
-- Does not revoke the 8 anon RLS helpers.
-- Does not rewrite storage.objects or move pg_net.
-- Apply by pasting this file in SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.

-- ---------------------------------------------------------------------------
-- 1. badges, bob_encouragement_catalog — catalog SELECT for signed-in only.
-- No INSERT / UPDATE / DELETE for anon or authenticated.
-- ---------------------------------------------------------------------------

grant select on table public.badges to authenticated;
revoke insert, update, delete on table public.badges from anon, authenticated, public;

drop policy if exists select_authenticated on public.badges;
create policy select_authenticated
  on public.badges
  for select
  to authenticated
  using (true);

grant select on table public.bob_encouragement_catalog to authenticated;
revoke insert, update, delete on table public.bob_encouragement_catalog from anon, authenticated, public;

drop policy if exists select_authenticated on public.bob_encouragement_catalog;
create policy select_authenticated
  on public.bob_encouragement_catalog
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2. challenge_payouts — own rows only. Live user column is user_id.
-- No client writes (authenticated already has SELECT only).
-- ---------------------------------------------------------------------------

revoke insert, update, delete on table public.challenge_payouts from anon, authenticated, public;
grant select on table public.challenge_payouts to authenticated;

drop policy if exists select_authenticated on public.challenge_payouts;
create policy select_authenticated
  on public.challenge_payouts
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. challenge_disputes — live columns have raised_by (filer), no respondent.
-- Viewer is filer or challenge host (challenges.created_by). No client writes.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on table public.challenge_disputes from anon, authenticated, public;
grant select on table public.challenge_disputes to authenticated;

drop policy if exists select_authenticated on public.challenge_disputes;
create policy select_authenticated
  on public.challenge_disputes
  for select
  to authenticated
  using (
    raised_by = auth.uid()
    or exists (
      select 1
      from public.challenges c
      where c.id = challenge_disputes.challenge_id
        and c.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. checkin_proof_locks — own check-in or participant on that challenge.
-- No client writes.
-- ---------------------------------------------------------------------------

grant select on table public.checkin_proof_locks to authenticated;
revoke insert, update, delete on table public.checkin_proof_locks from anon, authenticated, public;

drop policy if exists select_authenticated on public.checkin_proof_locks;
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

-- ---------------------------------------------------------------------------
-- 5. push_hook_config — left locked. Zero policies. No client access.
-- ---------------------------------------------------------------------------

-- (intentionally no policy)

notify pgrst, 'reload schema';

-- Verify (SQL Editor shows this last).
select
  c.relname as table_name,
  c.relrowsecurity as rls,
  coalesce(
    (
      select string_agg(pol.policyname || ':' || pol.cmd, ', ' order by pol.policyname)
      from pg_policies pol
      where pol.schemaname = 'public' and pol.tablename = c.relname
    ),
    'left locked'
  ) as policies
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
order by
  case c.relname
    when 'badges' then 1
    when 'bob_encouragement_catalog' then 2
    when 'challenge_payouts' then 3
    when 'challenge_disputes' then 4
    when 'checkin_proof_locks' then 5
    else 6
  end;
