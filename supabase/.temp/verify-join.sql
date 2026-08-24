select
  (pg_get_functiondef('public.join_challenge(uuid)'::regprocedure) like '%ref_type%') as has_ref_type,
  (pg_get_functiondef('public.join_challenge(uuid)'::regprocedure) like '%reference_id%') as has_reference_id,
  (pg_get_functiondef('public.join_challenge(uuid)'::regprocedure) like '%JOIN_CLOSED%') as has_join_closed,
  (pg_get_functiondef('public.join_challenge(uuid)'::regprocedure) like '%in_progress%') as mentions_in_progress;
