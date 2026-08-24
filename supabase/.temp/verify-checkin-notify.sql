select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'notify_challenge_checkin',
    'enqueue_notification_push',
    'profile_object_pronoun',
    'trg_notify_checkin_post',
    'trg_notify_post_mention',
    'trg_notify_comment_mention'
  )
order by 1, 2;
