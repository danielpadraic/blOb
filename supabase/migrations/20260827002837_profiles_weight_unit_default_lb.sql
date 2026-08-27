-- New profiles default to U.S. units. Do not rewrite rows that already saved kg.

alter table public.profiles
  alter column weight_unit set default 'lb';
