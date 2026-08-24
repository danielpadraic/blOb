select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'wallet_ledger'
order by ordinal_position;

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.wallet_ledger'::regclass and not tgisinternal;

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.challenge_participants'::regclass and not tgisinternal;
