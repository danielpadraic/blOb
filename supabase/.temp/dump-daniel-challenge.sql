select id, title, status, challenge_lane, visibility, discoverability, starts_at, official_started_at, buy_in_amount, currency, min_participants, max_participants, is_official, series_id, created_by
from public.challenges
where id = '8b59aa65-1f31-4d05-b631-cf6379392c96';

select count(*) as participants from public.challenge_participants
where challenge_id = '8b59aa65-1f31-4d05-b631-cf6379392c96';
