-- Official grant copy: drop “Skin in the game” from first Official join.
-- Safe to re-run. Does not change grant amounts.

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
        when 'first_proof' then 'you logged your first proof'
        when 'first_friend' then 'you made a friend'
        when 'first_official_join' then 'you joined Official'
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
      when 'first_official_join' then 'Buy-ins are not refundable. You only get money back if you finish and are paid in the split.'
      else null
    end;
$$;
