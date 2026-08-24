select
  (pg_get_functiondef('public.evaluate_badges()'::regprocedure) ilike '%ref_type%') as eval_has_ref_type,
  (pg_get_functiondef('public.claim_user_grant(uuid, text)'::regprocedure) ilike '%ref_type%') as grant_has_ref_type;
