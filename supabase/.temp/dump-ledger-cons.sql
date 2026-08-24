select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.wallet_ledger'::regclass;
