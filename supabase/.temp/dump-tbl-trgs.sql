select c.relname as tbl, t.tgname, p.proname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in ('wallet_ledger', 'challenge_participants', 'challenges', 'profiles')
order by 1, 2;
