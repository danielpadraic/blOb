select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.proname not in ('array_agg','string_agg','json_agg','jsonb_agg')
  and pg_get_functiondef(p.oid) ilike '%ref_type%';
