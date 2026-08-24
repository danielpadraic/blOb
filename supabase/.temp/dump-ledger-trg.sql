select tgname, pg_get_triggerdef(oid) as def
from pg_trigger
where tgrelid = 'public.wallet_ledger'::regclass and not tgisinternal;

select tgname, pg_get_triggerdef(oid) as def
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal
  and pg_get_triggerdef(oid) ilike '%ledger%';
