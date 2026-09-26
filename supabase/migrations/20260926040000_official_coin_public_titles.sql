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

-- Receipts already written keep pointing at the right room through challenge_id.
select official_kind, title, id
from public.challenges
where official_kind is not null
order by official_kind;
