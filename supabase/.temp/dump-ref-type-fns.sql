select n.nspname || '.' || p.proname as fn
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where pg_get_functiondef(p.oid) ilike '%ref_type%'
  and n.nspname = 'public'
order by 1;
