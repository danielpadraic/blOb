select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'wallet_ledger'
order by ordinal_position;

select tgname from pg_trigger
where tgrelid = 'public.wallet_ledger'::regclass and not tgisinternal;
