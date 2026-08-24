select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'join_challenge',
    'is_invite_only_challenge',
    'are_accepted_friends',
    'user_can_access_challenge',
    'challenge_available_in_jurisdiction',
    'tick_one_user_challenge_start'
  )
order by 1, 2;
