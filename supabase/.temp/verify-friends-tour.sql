select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('are_accepted_friends', 'set_create_tour_opt_out', 'join_challenge')
order by 1;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'create_tour_opt_out_at';
