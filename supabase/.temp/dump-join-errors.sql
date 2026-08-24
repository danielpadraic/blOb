select code, message, payload, created_at
from public.app_errors
where route = 'join_challenge' or payload::text ilike '%join%'
order by created_at desc
limit 20;

select id, title, status, starts_at, official_started_at, buy_in_amount, currency, visibility, is_official, series_id, min_participants, created_by
from public.challenges
where buy_in_amount = 10 and coalesce(is_official, false) = false
order by created_at desc
limit 15;
