-- Interests slice 2: catalog rating/qty kinds. Columns already exist on profile_interest_chips.
-- RLS unchanged. Ratings and extras stay owner-only. Public view still omits them.

alter table public.interest_chips
  drop constraint if exists interest_chips_rating_kind_check;

alter table public.interest_chips
  add constraint interest_chips_rating_kind_check check (
    rating_kind is null
    or rating_kind in ('dupr', 'utr', 'ntrp', 'handicap', 'mmr', 'grade', 'other')
  );

alter table public.interest_chips
  drop constraint if exists interest_chips_qty_kind_check;

alter table public.interest_chips
  add constraint interest_chips_qty_kind_check check (
    qty_kind is null
    or qty_kind in ('pages_week', 'books_year', 'miles_outing', 'sessions_week', 'fasting_hours')
  );

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
  ('health_fitness', 'other', false, null, null),
  ('sports', 'pickleball', true, 'dupr', null),
  ('sports', 'tennis', true, 'utr', null),
  ('sports', 'golf', true, 'handicap', null),
  ('sports', 'basketball', true, null, 'sessions_week'),
  ('sports', 'soccer', true, null, 'sessions_week'),
  ('sports', 'baseball', true, null, 'sessions_week'),
  ('sports', 'volleyball', true, null, 'sessions_week'),
  ('sports', 'climbing', true, 'grade', null),
  ('sports', 'martial_arts', true, null, 'sessions_week'),
  ('sports', 'hockey', true, null, 'sessions_week'),
  ('sports', 'football', true, null, 'sessions_week'),
  ('sports', 'other', false, null, null),
  ('personal_development', 'academics', false, null, null),
  ('personal_development', 'fasting', false, null, 'fasting_hours'),
  ('personal_development', 'work', false, null, null),
  ('personal_development', 'meditation', false, null, 'sessions_week'),
  ('personal_development', 'reading', false, null, 'pages_week'),
  ('personal_development', 'languages', false, null, 'sessions_week'),
  ('personal_development', 'music', false, null, 'sessions_week'),
  ('personal_development', 'writing', false, null, 'pages_week'),
  ('personal_development', 'other', false, null, null),
  ('relationships', 'dating', false, null, null),
  ('relationships', 'marriage', false, null, null),
  ('relationships', 'friendship', false, null, null),
  ('relationships', 'communication', false, null, null),
  ('relationships', 'family', false, null, null),
  ('relationships', 'other', false, null, null),
  ('esports', 'league', false, 'mmr', null),
  ('esports', 'cs2', false, 'mmr', null),
  ('esports', 'valorant', false, 'mmr', null),
  ('esports', 'dota_2', false, 'mmr', null),
  ('esports', 'mlbb', false, 'mmr', null),
  ('esports', 'pubg_mobile', false, 'mmr', null),
  ('esports', 'fortnite', false, 'mmr', null),
  ('esports', 'rocket_league', false, 'mmr', null),
  ('esports', 'apex', false, 'mmr', null),
  ('esports', 'cod', false, 'mmr', null),
  ('esports', 'ea_fc', false, 'mmr', null),
  ('esports', 'nba_2k', false, 'mmr', null),
  ('esports', 'sf_tekken', false, 'mmr', null),
  ('esports', 'smash', false, 'mmr', null),
  ('esports', 'starcraft_ii', false, 'mmr', null),
  ('esports', 'free_fire', false, 'mmr', null),
  ('esports', 'other', false, null, null),
  ('outdoors', 'hiking', false, null, 'miles_outing'),
  ('outdoors', 'camping', false, null, 'sessions_week'),
  ('outdoors', 'fishing', false, null, 'sessions_week'),
  ('outdoors', 'hunting', false, null, 'sessions_week'),
  ('outdoors', 'trail_running', false, null, 'miles_outing'),
  ('outdoors', 'kayaking', false, null, 'miles_outing'),
  ('outdoors', 'skiing', false, null, 'sessions_week'),
  ('outdoors', 'snowboarding', false, null, 'sessions_week'),
  ('outdoors', 'gardening', false, null, 'sessions_week'),
  ('outdoors', 'other', false, null, null)
) as v(room_slug, slug, allows_indoor_outdoor, rating_kind, qty_kind)
where interest_chips.room_slug = v.room_slug
  and interest_chips.slug = v.slug;
