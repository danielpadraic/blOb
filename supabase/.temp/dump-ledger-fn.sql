select tgname, pg_get_triggerdef(t.oid) as def, p.proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.wallet_ledger'::regclass and not t.tgisinternal;

select pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname like '%wallet_ledger%';
