-- PREVIEW ONLY. No writes.
-- SQL Editor → project blOb-app (tguzdtwsajnnczdxjqyq) → Run.

-- 1. Columns
select table_name, column_name, ordinal_position, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'badges',
    'bob_encouragement_catalog',
    'challenge_payouts',
    'challenge_disputes',
    'checkin_proof_locks',
    'push_hook_config'
  )
order by table_name, ordinal_position;

-- 2. Current policies (expect zero rows before WRITE)
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'badges',
    'bob_encouragement_catalog',
    'challenge_payouts',
    'challenge_disputes',
    'checkin_proof_locks',
    'push_hook_config'
  )
order by tablename, policyname;

-- 3. RLS on, and table grants
select c.relname, c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'badges',
    'bob_encouragement_catalog',
    'challenge_payouts',
    'challenge_disputes',
    'checkin_proof_locks',
    'push_hook_config'
  )
order by 1;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'badges',
    'bob_encouragement_catalog',
    'challenge_payouts',
    'challenge_disputes',
    'checkin_proof_locks',
    'push_hook_config'
  )
  and grantee in ('anon', 'authenticated', 'public', 'service_role')
order by table_name, grantee, privilege_type;
