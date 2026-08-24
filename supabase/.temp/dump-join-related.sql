select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('join_challenge', 'is_invite_only_challenge', 'are_accepted_friends', 'user_can_access_challenge');

select pg_get_functiondef('public.is_invite_only_challenge(public.challenges)'::regprocedure);

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'challenge_participants'
order by ordinal_position;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.challenge_participants'::regclass;
