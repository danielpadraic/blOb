-- Official Coin gets its public name.
--
-- official_kind stays coin_weekly / coin_monthly, ids stay, windows stay.
-- Only the user-facing title changes, so notifications, wallet receipts, and
-- settlement copy read the same words the app prints.
--
-- The client is already authoritative for display (officialCoinDisplayTitle in
-- lib/officialCoin.ts keys off official_kind). This keeps the column in step.

update public.challenges
set title = 'Weekly Fitness Challenge',
    updated_at = now()
where official_kind = 'coin_weekly'
  and title is distinct from 'Weekly Fitness Challenge';

update public.challenges
set title = 'Monthly Fitness Challenge',
    updated_at = now()
where official_kind = 'coin_monthly'
  and title is distinct from 'Monthly Fitness Challenge';

-- The Overview says it once now, in the About block under the hero card.
-- Clear the stored blurb so the old "The house room. Log a workout..." line
-- cannot surface from the description section, and keep `rules` in step with
-- what the app prints.
update public.challenges
set description = null,
    rules = 'Official blOb Challenge: Earn coins by Checking In consistently each day. '
         || 'The more consistent you are, the higher the prize. '
         || 'Check-In Proof: a Pre-Workout Selfie, a Post-Workout Selfie, '
         || 'Proof of 30-Minutes of Elevated Heart Rate.',
    updated_at = now()
where official_kind in ('coin_weekly', 'coin_monthly');

-- Receipts already written keep pointing at the right room through challenge_id.
select official_kind, title, description, id
from public.challenges
where official_kind is not null
order by official_kind;
