select proname::text
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('are_accepted_friends', 'set_create_tour_opt_out', 'join_challenge')
order by 1;
