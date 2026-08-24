alter table public.challenges
  add column if not exists sponsor_name text,
  add column if not exists sponsor_logo_url text;

comment on column public.challenges.sponsor_name is
  'Official card sponsor line. Null uses the default blOb wordmark.';
comment on column public.challenges.sponsor_logo_url is
  'Optional sponsor logo. When set, Official cards show it after “Sponsored by”.';
