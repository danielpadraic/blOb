-- PREVIEW ONLY. No writes.
-- SQL Editor → project blOb-app (tguzdtwsajnnczdxjqyq) → Run.
-- Six result sets.

-- 1. profiles_public columns
select column_name, ordinal_position, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles_public'
order by ordinal_position;

-- 2. profiles_public security_invoker / options
select
  c.relname as view_name,
  c.reloptions,
  pg_get_viewdef('public.profiles_public'::regclass, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles_public' and c.relkind = 'v';

-- 3. Named functions: identity args + current EXECUTE grants
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  coalesce(p.proconfig, '{}'::text[]) as config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ex,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_ex,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_ex
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'tick_settlements',
    'settle_ended_challenge',
    'settle_ended_challenge_core',
    'stamp_challenge_settlement_results',
    'credit_wallet_top_up',
    'transfer_funds',
    'top_up_challenge_prize',
    'refund_pre_start',
    'void_challenge_refund_field',
    'wipe_user_challenge_progress',
    'admin_pulse',
    'admin_pulse_list',
    'admin_wallets',
    'write_coin_ledger',
    'hr_integrity_review',
    'trg_notify_callout',
    'trg_notify_live_post',
    'trg_notify_story_comment',
    'trg_notify_story_reaction',
    'trg_snapshot_comment_edit',
    'join_challenge',
    'publish_challenge',
    'create_callout',
    'accept_callout',
    'decline_callout',
    'cancel_callout',
    'cancel_challenge',
    'block_user',
    'unblock_user',
    'register_push_token',
    'clear_push_token',
    'log_health_workout',
    'submit_callout_result',
    'can_read_post',
    'can_read_clip',
    'can_read_circle_post',
    'can_read_wall_as_host',
    'user_can_see_post',
    'user_can_access_challenge',
    'users_blocked',
    'user_is_muted',
    'are_accepted_friends',
    'blocked_peer_ids',
    'is_circle_member',
    'is_circle_host',
    'can_join_circle',
    'tick_official_series',
    'tick_user_challenge_starts',
    'sync_challenge_misses',
    'tick_user_grants',
    'sync_challenge_statuses'
  )
order by p.proname, 2;

-- 4. Verify-set (the lock's expected rows, current values)
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ex,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'write_coin_ledger',
    'tick_settlements',
    'settle_ended_challenge',
    'wipe_user_challenge_progress',
    'join_challenge',
    'can_read_post',
    'tick_official_series'
  )
order by p.proname, 2;

-- 5. SECURITY DEFINER in public with EXECUTE for anon (candidates to revoke)
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ex,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname, 2;

-- 6. public functions with mutable search_path (no search_path in proconfig)
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.prokind,
  coalesce(p.proconfig, '{}'::text[]) as config
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prokind in ('f', 'p', 'w')
  and (
    p.proconfig is null
    or not exists (
      select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
    )
  )
order by p.proname, 2;
