-- Advisor pass 1: profiles_public invoker + EXECUTE grants + search_path.
-- Does not change save_checkin_proof / submit_checkin signatures or settlement math.
-- Does not move pg_net. Does not rewrite Storage policies.
-- Apply by pasting this file in Supabase SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all.

-- ---------------------------------------------------------------------------
-- A. profiles_public — security_invoker, same 19 columns the app already has.
-- Fitness numbers are not selected from profiles (authenticated has no grant
-- on height/weight). Names stay so search_people's return type is unchanged.
-- Body metrics (gender, BMI, BFP, phone, address, DOB) are not added.
-- ---------------------------------------------------------------------------

create or replace view public.profiles_public
with (security_invoker = true)
as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.cover_url,
  p.bio,
  p.skill_tags,
  p.created_at,
  p.is_official,
  p.is_creator,
  p.allow_profile_posts,
  p.profile_visibility,
  p.show_fitness_stats_publicly,
  null::numeric as height_cm,
  null::numeric as current_weight,
  null::numeric as goal_weight,
  null::text as weight_unit,
  null::integer as typical_weekly_workout_frequency,
  null::text[] as primary_activities
from public.profiles p
where auth.uid() is not null;

alter view public.profiles_public set (security_invoker = true);

revoke all on public.profiles_public from anon, public;
grant select on public.profiles_public to authenticated;

comment on view public.profiles_public is
  'Other members'' identity for feeds and cards. Invoker-rights; signed-in only. Fitness numbers stay on get_my_profile, not this view.';

-- ---------------------------------------------------------------------------
-- B. Money / admin / destructive — REVOKE anon, authenticated, public.
-- write_coin_ledger stays revoked for every client role including service_role.
-- Cron ticks keep service_role on the settle/tick functions only.
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_pulse(p_range text) from anon, authenticated, public;
revoke execute on function public.admin_pulse_list(p_metric text, p_range text) from anon, authenticated, public;
revoke execute on function public.admin_wallets() from anon, authenticated, public;
revoke execute on function public.credit_wallet_top_up(p_user_id uuid, p_amount numeric, p_payment_intent_id text, p_checkout_session_id text, p_charge_amount numeric, p_metadata jsonb) from anon, authenticated, public;
revoke execute on function public.hr_integrity_review(p_days integer, p_min_history integer, p_threshold numeric) from anon, authenticated, public;
revoke execute on function public.refund_pre_start(p_challenge_id uuid, p_user_id uuid) from anon, authenticated, public;
revoke execute on function public.settle_ended_challenge(p_challenge_id uuid) from anon, authenticated, public;
revoke execute on function public.settle_ended_challenge_core(p_challenge_id uuid) from anon, authenticated, public;
revoke execute on function public.stamp_challenge_settlement_results(p_challenge_id uuid, p_winners uuid[]) from anon, authenticated, public;
revoke execute on function public.tick_settlements() from anon, authenticated, public;
revoke execute on function public.top_up_challenge_prize(p_challenge_id uuid, p_amount numeric, p_request_id uuid) from anon, authenticated, public;
revoke execute on function public.void_challenge_refund_field(p_challenge_id uuid) from anon, authenticated, public;
revoke execute on function public.wipe_user_challenge_progress(p_challenge_id uuid) from anon, authenticated, public;
revoke execute on function public.write_coin_ledger(p_user_id uuid, p_amount numeric, p_grant_key text) from anon, authenticated, public, service_role;

grant execute on function public.credit_wallet_top_up(p_user_id uuid, p_amount numeric, p_payment_intent_id text, p_checkout_session_id text, p_charge_amount numeric, p_metadata jsonb) to service_role;
grant execute on function public.settle_ended_challenge(p_challenge_id uuid) to service_role;
grant execute on function public.settle_ended_challenge_core(p_challenge_id uuid) to service_role;
grant execute on function public.stamp_challenge_settlement_results(p_challenge_id uuid, p_winners uuid[]) to service_role;
grant execute on function public.tick_settlements() to service_role;
grant execute on function public.refund_pre_start(p_challenge_id uuid, p_user_id uuid) to service_role;
grant execute on function public.void_challenge_refund_field(p_challenge_id uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Trigger-only — REVOKE anon, authenticated, public. Triggers still fire.
-- ---------------------------------------------------------------------------

revoke execute on function public.trg_notify_callout() from anon, authenticated, public;
revoke execute on function public.trg_notify_live_post() from anon, authenticated, public;
revoke execute on function public.trg_notify_story_comment() from anon, authenticated, public;
revoke execute on function public.trg_notify_story_reaction() from anon, authenticated, public;
revoke execute on function public.trg_snapshot_comment_edit() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Anon loses app RPCs. KEEP authenticated (Send Coins calls transfer_funds).
-- ---------------------------------------------------------------------------

revoke execute on function public.accept_callout(p_callout_id uuid) from anon, public;
revoke execute on function public.block_user(p_target uuid) from anon, public;
revoke execute on function public.cancel_callout(p_callout_id uuid) from anon, public;
revoke execute on function public.cancel_challenge(p_challenge_id uuid) from anon, public;
revoke execute on function public.clear_push_token(p_token text) from anon, public;
revoke execute on function public.create_callout(p_opponent_id uuid, p_amount numeric, p_currency text, p_win_condition text, p_deadline timestamp with time zone) from anon, public;
revoke execute on function public.create_callout(p_opponent_id uuid, p_amount numeric, p_currency text, p_win_condition text, p_deadline timestamp with time zone, p_proofs jsonb, p_format text) from anon, public;
revoke execute on function public.create_callout(p_opponent_id uuid, p_title text, p_description text, p_currency text, p_stake_amount numeric) from anon, public;
revoke execute on function public.decline_callout(p_callout_id uuid) from anon, public;
revoke execute on function public.join_challenge(p_challenge_id uuid) from anon, public;
revoke execute on function public.log_health_workout(p_challenge_id uuid, p_health_workout_id uuid, p_submission_date date, p_notes text) from anon, public;
revoke execute on function public.publish_challenge(p_payload jsonb) from anon, public;
revoke execute on function public.register_push_token(p_token text, p_platform text) from anon, public;
revoke execute on function public.submit_callout_result(p_callout_id uuid, p_result text) from anon, public;
revoke execute on function public.submit_callout_result(p_callout_id uuid, p_winner_id uuid) from anon, public;
revoke execute on function public.transfer_funds(p_to_user uuid, p_currency text, p_amount numeric, p_reason text, p_reference_id uuid) from anon, public;
revoke execute on function public.unblock_user(p_target uuid) from anon, public;

-- Every other public SECURITY DEFINER that is not an RLS helper: drop anon + public.
-- REVOKE FROM public also drops inherited authenticated / service_role EXECUTE.
-- Put authenticated back when they already had it (save_checkin_proof / submit_checkin /
-- search_people stay signed-in). Do not grant authenticated on money/admin/trigger-only.
-- Do not grant write_coin_ledger to anyone.
do $$
declare
  r record;
  skip constant text[] := array[
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
    'post_author_id',
    'comment_author_id',
    'friendship_is_blocked',
    'direct_thread_is_blocked',
    'is_callout_reader',
    'is_conversation_member',
    'is_official_viewer',
    'lift_session_readable',
    'can_post_on_profile'
  ];
  deny_auth constant text[] := array[
    'tick_settlements',
    'settle_ended_challenge',
    'settle_ended_challenge_core',
    'stamp_challenge_settlement_results',
    'credit_wallet_top_up',
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
    'trg_snapshot_comment_edit'
  ];
begin
  for r in
    select
      p.oid::regprocedure as sig,
      p.proname,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proname <> all (skip)
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    if r.proname = any (deny_auth) then
      execute format('revoke execute on function %s from authenticated', r.sig);
    elsif r.auth_ex then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if r.proname is distinct from 'write_coin_ledger' then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- KEEP EXECUTE for authenticated (RLS helpers + ticks + signed-in app RPCs).
grant execute on function public.accept_callout(p_callout_id uuid) to authenticated;
grant execute on function public.are_accepted_friends(p_a uuid, p_b uuid) to authenticated;
grant execute on function public.block_user(p_target uuid) to authenticated;
grant execute on function public.blocked_peer_ids() to authenticated;
grant execute on function public.can_join_circle(p_circle_id uuid, p_user_id uuid) to authenticated;
grant execute on function public.can_read_circle_post(p_circle_id uuid, p_type text, p_author_id uuid, p_audience text) to authenticated;
grant execute on function public.can_read_clip(p_author_id uuid, p_post_id uuid) to authenticated;
grant execute on function public.can_read_post(p_author_id uuid, p_audience text, p_audience_user_ids uuid[], p_challenge_id uuid) to authenticated;
grant execute on function public.can_read_wall_as_host(p_author_id uuid, p_audience text, p_wall_host_id uuid, p_wall_removed_at timestamp with time zone) to authenticated;
grant execute on function public.cancel_callout(p_callout_id uuid) to authenticated;
grant execute on function public.cancel_challenge(p_challenge_id uuid) to authenticated;
grant execute on function public.clear_push_token(p_token text) to authenticated;
grant execute on function public.create_callout(p_opponent_id uuid, p_amount numeric, p_currency text, p_win_condition text, p_deadline timestamp with time zone) to authenticated;
grant execute on function public.create_callout(p_opponent_id uuid, p_amount numeric, p_currency text, p_win_condition text, p_deadline timestamp with time zone, p_proofs jsonb, p_format text) to authenticated;
grant execute on function public.create_callout(p_opponent_id uuid, p_title text, p_description text, p_currency text, p_stake_amount numeric) to authenticated;
grant execute on function public.decline_callout(p_callout_id uuid) to authenticated;
grant execute on function public.is_circle_host(p_circle_id uuid, p_user_id uuid) to authenticated;
grant execute on function public.is_circle_member(p_circle_id uuid, p_user_id uuid) to authenticated;
grant execute on function public.join_challenge(p_challenge_id uuid) to authenticated;
grant execute on function public.log_health_workout(p_challenge_id uuid, p_health_workout_id uuid, p_submission_date date, p_notes text) to authenticated;
grant execute on function public.publish_challenge(p_payload jsonb) to authenticated;
grant execute on function public.register_push_token(p_token text, p_platform text) to authenticated;
grant execute on function public.submit_callout_result(p_callout_id uuid, p_result text) to authenticated;
grant execute on function public.submit_callout_result(p_callout_id uuid, p_winner_id uuid) to authenticated;
grant execute on function public.sync_challenge_misses() to authenticated;
grant execute on function public.sync_challenge_statuses() to authenticated;
grant execute on function public.tick_official_series() to authenticated;
grant execute on function public.tick_user_challenge_starts() to authenticated;
grant execute on function public.tick_user_grants() to authenticated;
grant execute on function public.transfer_funds(p_to_user uuid, p_currency text, p_amount numeric, p_reason text, p_reference_id uuid) to authenticated;
grant execute on function public.unblock_user(p_target uuid) to authenticated;
grant execute on function public.user_can_access_challenge(p_challenge_id uuid) to authenticated;
grant execute on function public.user_can_access_challenge(p_challenge_id uuid, p_user_id uuid) to authenticated;
grant execute on function public.user_can_see_post(p_user_id uuid, p_post_id uuid) to authenticated;
grant execute on function public.user_is_muted(p_viewer uuid, p_author uuid) to authenticated;
grant execute on function public.users_blocked(p_a uuid, p_b uuid) to authenticated;

grant execute on function public.sync_challenge_misses() to service_role;
grant execute on function public.sync_challenge_statuses() to service_role;
grant execute on function public.tick_official_series() to service_role;
grant execute on function public.tick_user_challenge_starts() to service_role;
grant execute on function public.tick_user_grants() to service_role;

-- RLS helpers that anon already used in policies stay executable for anon.
grant execute on function public.can_read_post(p_author_id uuid, p_audience text, p_audience_user_ids uuid[], p_challenge_id uuid) to anon;
grant execute on function public.user_can_access_challenge(p_challenge_id uuid) to anon;
grant execute on function public.user_can_access_challenge(p_challenge_id uuid, p_user_id uuid) to anon;
grant execute on function public.users_blocked(p_a uuid, p_b uuid) to anon;
grant execute on function public.user_is_muted(p_viewer uuid, p_author uuid) to anon;
grant execute on function public.blocked_peer_ids() to anon;
grant execute on function public.post_author_id(p_post_id uuid) to anon, authenticated;
grant execute on function public.comment_author_id(p_comment_id uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pass 2. search_path only. Live signatures from pg_proc 2026-09-09.
-- Body is not replaced. Both even_split_shares overloads are altered.
-- ---------------------------------------------------------------------------

alter function public.admin_range_start(p_range text) set search_path = public, pg_temp;
alter function public.assert_format_payout_pair(p_format text, p_prize_structure text, p_payout_mode text) set search_path = public, pg_temp;
alter function public.bob_subst_line(p_template text, p_n integer, p_challenge text) set search_path = public, pg_temp;
alter function public.callout_first_proof_type(p_proofs jsonb) set search_path = public, pg_temp;
alter function public.callout_invite_is_expired(p_row callouts) set search_path = public, pg_temp;
alter function public.callout_normalized_format(p_format text) set search_path = public, pg_temp;
alter function public.callout_normalized_proofs(p_proofs jsonb) set search_path = public, pg_temp;
alter function public.callout_proof_requirements(p_proofs jsonb) set search_path = public, pg_temp;
alter function public.challenge_allows_main_feed_announce(p_challenge challenges) set search_path = public, pg_temp;
alter function public.challenge_checkins_stamp_scoring_version() set search_path = public, pg_temp;
alter function public.challenge_display_title(ch challenges) set search_path = public, pg_temp;
alter function public.challenge_uses_total_count(ch challenges) set search_path = public, pg_temp;
alter function public.checkin_current_row(ch challenges, p_uid uuid, p_period date) set search_path = public, pg_temp;
alter function public.checkin_open_row(ch challenges, p_uid uuid, p_period date) set search_path = public, pg_temp;
alter function public.chicago_today() set search_path = public, pg_temp;
alter function public.circle_pins_enforce_cap() set search_path = public, pg_temp;
alter function public.cumulative_metrics_hit(p_metrics jsonb, p_totals jsonb) set search_path = public, pg_temp;
alter function public.even_split_shares(p_pool numeric, p_count integer) set search_path = public, pg_temp;
alter function public.even_split_shares(p_pool numeric, p_count integer, p_currency text) set search_path = public, pg_temp;
alter function public.fitness_profile_is_complete(p profiles) set search_path = public, pg_temp;
alter function public.geo_distance_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision) set search_path = public, pg_temp;
alter function public.grant_catalog_amount(p_grant_key text) set search_path = public, pg_temp;
alter function public.grant_copy(p_grant_key text, p_amount numeric) set search_path = public, pg_temp;
alter function public.guard_official_health_only() set search_path = public, pg_temp;
alter function public.guard_workout_on_closed_challenge() set search_path = public, pg_temp;
alter function public.hr_baseline_floor(p_feature text) set search_path = public, pg_temp;
alter function public.is_invite_only_challenge(p_challenge challenges) set search_path = public, pg_temp;
alter function public.is_live_origin_post(p_source text, p_challenge_id uuid) set search_path = public, pg_temp;
alter function public.live_chat_snippet(p_text text) set search_path = public, pg_temp;
alter function public.live_href(p_challenge_id uuid, p_post_id uuid, p_comment_id uuid) set search_path = public, pg_temp;
alter function public.live_joined_participant(p_status text, p_eliminated_at timestamp with time zone) set search_path = public, pg_temp;
alter function public.live_thread_read_forward_only() set search_path = public, pg_temp;
alter function public.normalize_wallet_currency(p_currency text) set search_path = public, pg_temp;
alter function public.official_compute_day_windows(p_starts_at timestamp with time zone, p_tz text, p_days integer) set search_path = public, pg_temp;
alter function public.official_submission_is_valid(p_pre text, p_post text, p_hr text, p_health_workout_id uuid, p_proof_kind text) set search_path = public, pg_temp;
alter function public.official_window_at(p_windows jsonb, p_at timestamp with time zone) set search_path = public, pg_temp;
alter function public.profile_interest_chip_catalog_guard() set search_path = public, pg_temp;
alter function public.profile_interest_pin_cap() set search_path = public, pg_temp;
alter function public.pronoun_object(p_gender text) set search_path = public, pg_temp;
alter function public.requires_official_body_metrics(p_c challenges) set search_path = public, pg_temp;
alter function public.scaled_place_shares(p_pool numeric, p_count integer) set search_path = public, pg_temp;
alter function public.settlement_format_amount(p_amount numeric, p_currency text) set search_path = public, pg_temp;
alter function public.settlement_format_family(p_challenge challenges) set search_path = public, pg_temp;
alter function public.settlement_is_even_split(p_challenge challenges) set search_path = public, pg_temp;
alter function public.settlement_is_illegal_pair(p_challenge challenges) set search_path = public, pg_temp;
alter function public.settlement_required_days(p_challenge challenges) set search_path = public, pg_temp;
alter function public.settlement_review_window() set search_path = public, pg_temp;
alter function public.settlement_wallet_amount_label(p_amount numeric, p_currency text) set search_path = public, pg_temp;
alter function public.stacked_interaction_title(p_name text, p_count integer, p_one_suffix text, p_many_suffix text) set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.trg_assert_format_payout_pair() set search_path = public, pg_temp;
alter function public.trg_user_challenge_duration_insert() set search_path = public, pg_temp;
alter function public.trg_user_challenge_duration_update() set search_path = public, pg_temp;
alter function public.user_challenge_ends_at(p_starts timestamp with time zone, p_days integer) set search_path = public, pg_temp;
alter function public.void_settlement_copy(p_refund_buyin boolean, p_return_host boolean) set search_path = public, pg_temp;
alter function public.winner_digest_line(p_challenge_title text, p_friend_names text[], p_viewer_finished boolean) set search_path = public, pg_temp;

notify pgrst, 'reload schema';

-- Verify (SQL Editor shows this result set last).
select
  p.proname,
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
order by p.proname;
