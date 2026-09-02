-- Interests activity cards: stance 1–5, qty period, multi proof, 10 coins per room once.
-- Additive on live stamp 20260902153021. RLS unchanged. Ratings, stance, employer, proofs stay owner-only.

alter table public.profile_interest_chips
  add column if not exists stance_score int,
  add column if not exists qty_period text,
  add column if not exists preferred_proofs text[] not null default '{}'::text[];

alter table public.profile_interest_rooms
  add column if not exists coins_granted_at timestamptz;

comment on column public.profile_interest_chips.stance_score is
  '1–5 Excel → Leveling up. 1–2 excel, 3 both, 4–5 level_up for old rows.';
comment on column public.profile_interest_chips.qty_period is
  'session | day | week | month | year. Default week for distance/volume.';
comment on column public.profile_interest_chips.preferred_proofs is
  'honor, photo, time, score, fitness_tracker. Never Health. Empty allowed.';
comment on column public.profile_interest_rooms.coins_granted_at is
  'First complete_empty or complete_filled coin grant. Replay must not double-pay.';

update public.profile_interest_chips
set stance_score = case
  when excel and level_up then 3
  when excel then 2
  when level_up then 4
  else 3
end
where stance_score is null;

update public.profile_interest_chips
set preferred_proofs = array[preferred_proof]
where preferred_proof is not null
  and preferred_proofs = '{}'::text[];

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_stance_check;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_stance_check check (
    (stance_score is not null and stance_score between 1 and 5)
    or excel
    or level_up
  );

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_qty_period_check;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_qty_period_check check (
    qty_period is null
    or qty_period in ('session', 'day', 'week', 'month', 'year')
  );

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_stance_score_check;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_stance_score_check check (
    stance_score is null or stance_score between 1 and 5
  );

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_proofs_check;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_proofs_check check (
    preferred_proofs <@ array['honor', 'photo', 'time', 'score', 'fitness_tracker']::text[]
  );

-- Frequency on sports / eSports / relationships. Health Other optional sessions. No new rooms.
update public.interest_chips set
  allows_indoor_outdoor = v.allows_indoor_outdoor,
  rating_kind = v.rating_kind,
  qty_kind = v.qty_kind
from (values
  ('health_fitness', 'running', true, null::text, 'miles_outing'),
  ('health_fitness', 'lifting', true, null, 'sessions_week'),
  ('health_fitness', 'walking', true, null, 'miles_outing'),
  ('health_fitness', 'cycling', true, null, 'miles_outing'),
  ('health_fitness', 'hiit', true, null, 'sessions_week'),
  ('health_fitness', 'yoga', true, null, 'sessions_week'),
  ('health_fitness', 'swimming', true, null, 'miles_outing'),
  ('health_fitness', 'mobility', true, null, 'sessions_week'),
  ('health_fitness', 'hyrox', true, null, 'sessions_week'),
  ('health_fitness', 'pilates', true, null, 'sessions_week'),
  ('health_fitness', 'rowing', true, null, 'miles_outing'),
  ('health_fitness', 'other', false, null, 'sessions_week'),
  ('sports', 'pickleball', true, 'dupr', 'sessions_week'),
  ('sports', 'tennis', true, 'utr', 'sessions_week'),
  ('sports', 'golf', true, 'handicap', 'sessions_week'),
  ('sports', 'basketball', true, null, 'sessions_week'),
  ('sports', 'soccer', true, null, 'sessions_week'),
  ('sports', 'baseball', true, null, 'sessions_week'),
  ('sports', 'volleyball', true, null, 'sessions_week'),
  ('sports', 'climbing', true, 'grade', 'sessions_week'),
  ('sports', 'martial_arts', true, null, 'sessions_week'),
  ('sports', 'hockey', true, null, 'sessions_week'),
  ('sports', 'football', true, null, 'sessions_week'),
  ('sports', 'other', false, null, 'sessions_week'),
  ('personal_development', 'academics', false, null, null),
  ('personal_development', 'fasting', false, null, 'fasting_hours'),
  ('personal_development', 'work', false, null, null),
  ('personal_development', 'meditation', false, null, 'sessions_week'),
  ('personal_development', 'reading', false, null, 'pages_week'),
  ('personal_development', 'languages', false, null, 'sessions_week'),
  ('personal_development', 'music', false, null, 'sessions_week'),
  ('personal_development', 'writing', false, null, 'pages_week'),
  ('personal_development', 'other', false, null, 'sessions_week'),
  ('relationships', 'dating', false, null, 'sessions_week'),
  ('relationships', 'marriage', false, null, 'sessions_week'),
  ('relationships', 'friendship', false, null, 'sessions_week'),
  ('relationships', 'communication', false, null, 'sessions_week'),
  ('relationships', 'family', false, null, 'sessions_week'),
  ('relationships', 'other', false, null, 'sessions_week'),
  ('esports', 'league', false, 'mmr', 'sessions_week'),
  ('esports', 'cs2', false, 'mmr', 'sessions_week'),
  ('esports', 'valorant', false, 'mmr', 'sessions_week'),
  ('esports', 'dota_2', false, 'mmr', 'sessions_week'),
  ('esports', 'mlbb', false, 'mmr', 'sessions_week'),
  ('esports', 'pubg_mobile', false, 'mmr', 'sessions_week'),
  ('esports', 'fortnite', false, 'mmr', 'sessions_week'),
  ('esports', 'rocket_league', false, 'mmr', 'sessions_week'),
  ('esports', 'apex', false, 'mmr', 'sessions_week'),
  ('esports', 'cod', false, 'mmr', 'sessions_week'),
  ('esports', 'ea_fc', false, 'mmr', 'sessions_week'),
  ('esports', 'nba_2k', false, 'mmr', 'sessions_week'),
  ('esports', 'sf_tekken', false, 'mmr', 'sessions_week'),
  ('esports', 'smash', false, 'mmr', 'sessions_week'),
  ('esports', 'starcraft_ii', false, 'mmr', 'sessions_week'),
  ('esports', 'free_fire', false, 'mmr', 'sessions_week'),
  ('esports', 'other', false, null, 'sessions_week'),
  ('outdoors', 'hiking', false, null, 'miles_outing'),
  ('outdoors', 'camping', false, null, 'sessions_week'),
  ('outdoors', 'fishing', false, null, 'sessions_week'),
  ('outdoors', 'hunting', false, null, 'sessions_week'),
  ('outdoors', 'trail_running', false, null, 'miles_outing'),
  ('outdoors', 'kayaking', false, null, 'miles_outing'),
  ('outdoors', 'skiing', false, null, 'sessions_week'),
  ('outdoors', 'snowboarding', false, null, 'sessions_week'),
  ('outdoors', 'gardening', false, null, 'sessions_week'),
  ('outdoors', 'other', false, null, 'sessions_week')
) as v(room_slug, slug, allows_indoor_outdoor, rating_kind, qty_kind)
where interest_chips.room_slug = v.room_slug
  and interest_chips.slug = v.slug;

create or replace function public.grant_catalog_amount(p_grant_key text)
returns numeric
language sql
immutable
as $$
  select case p_grant_key
    when 'signup_100' then 100
    when 'fitness_profile_complete' then 50
    when 'daily_login' then 10
    when 'streak_3' then 10
    when 'streak_7' then 25
    when 'streak_30' then 50
    when 'first_challenge_created' then 25
    when 'first_challenge_completed' then 50
    when 'first_proof' then 25
    when 'first_friend' then 10
    when 'first_official_join' then 15
    when 'interests_room_health_fitness' then 10
    when 'interests_room_sports' then 10
    when 'interests_room_personal_development' then 10
    when 'interests_room_relationships' then 10
    when 'interests_room_esports' then 10
    when 'interests_room_outdoors' then 10
    else null
  end;
$$;

create or replace function public.grant_copy(p_grant_key text, p_amount numeric)
returns table (title text, body text)
language sql
immutable
as $$
  select
    ('+' || trim(to_char(p_amount, 'FM999999990')) || ' coins · ' ||
      case p_grant_key
        when 'signup_100' then 'welcome to blOb'
        when 'fitness_profile_complete' then 'fitness profile complete'
        when 'daily_login' then 'you showed up today'
        when 'streak_3' then '3-day streak'
        when 'streak_7' then '7-day streak'
        when 'streak_30' then '30-day streak'
        when 'first_challenge_created' then 'you created your first challenge'
        when 'first_challenge_completed' then 'you finished your first challenge'
        when 'first_proof' then 'your first check-in'
        when 'first_friend' then 'you made a friend'
        when 'first_official_join' then 'you joined Official'
        when 'interests_room_health_fitness' then 'health & fitness'
        when 'interests_room_sports' then 'sports'
        when 'interests_room_personal_development' then 'personal development'
        when 'interests_room_relationships' then 'relationships'
        when 'interests_room_esports' then 'esports'
        when 'interests_room_outdoors' then 'outdoors'
        else p_grant_key
      end
    )::text,
    case p_grant_key
      when 'signup_100' then 'Coins are for showing up. They are not cash.'
      when 'fitness_profile_complete' then 'Those details stay private unless you share them.'
      when 'daily_login' then 'First open of the Chicago day. That is the whole trick.'
      when 'streak_3' then 'You showed up three days. That is the habit starting.'
      when 'streak_7' then 'A week. The thing is becoming who you are.'
      when 'streak_30' then 'Thirty days. You did the thing.'
      when 'first_challenge_created' then 'You hosted. Someone else can now show up with you.'
      when 'first_challenge_completed' then 'You finished without dropping. Keep that.'
      when 'first_proof' then 'Proof on the board. Not a speech.'
      when 'first_friend' then 'Bob was already here. This one is yours.'
      when 'first_official_join' then 'Entry fees are not refundable. Finishers are paid from the prize.'
      when 'interests_room_health_fitness' then 'Ten coins, once. Bob noted what you do.'
      when 'interests_room_sports' then 'Ten coins, once. Bob noted what you do.'
      when 'interests_room_personal_development' then 'Ten coins, once. Bob noted what you do.'
      when 'interests_room_relationships' then 'Ten coins, once. Bob noted what you do.'
      when 'interests_room_esports' then 'Ten coins, once. Bob noted what you do.'
      when 'interests_room_outdoors' then 'Ten coins, once. Bob noted what you do.'
      else null
    end;
$$;

create or replace function public.maybe_grant_interest_room_coins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_row jsonb;
begin
  if new.state not in ('complete_empty', 'complete_filled') then
    return new;
  end if;
  if new.coins_granted_at is not null then
    return new;
  end if;
  v_key := 'interests_room_' || new.room_slug;
  begin
    v_row := public.claim_user_grant(new.user_id, v_key);
  exception when others then
    v_row := jsonb_build_object('ok', false, 'error', 'GRANT_FAILED');
  end;
  if coalesce(v_row->>'error', '') = 'UNKNOWN_GRANT' then
    return new;
  end if;
  if coalesce((v_row->>'ok')::boolean, false) then
    new.coins_granted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profile_interest_rooms_grant_coins on public.profile_interest_rooms;
create trigger profile_interest_rooms_grant_coins
  before insert or update of state on public.profile_interest_rooms
  for each row
  execute function public.maybe_grant_interest_room_coins();

revoke all on function public.maybe_grant_interest_room_coins() from public, anon, authenticated;
