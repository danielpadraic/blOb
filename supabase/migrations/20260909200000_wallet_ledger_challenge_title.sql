-- Persist challenge name on wallet_ledger so receipts never print "this challenge".
-- Does not change settlement math, prize_pool, or write_coin_ledger grants.
-- Apply in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.

alter table public.wallet_ledger
  add column if not exists challenge_title text;

comment on column public.wallet_ledger.challenge_title is
  'Challenge name stamped at write. Receipts use this when the challenge row is gone or unreadable.';

create or replace function public.trg_wallet_ledger_challenge_title()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  if new.challenge_id is null then
    return new;
  end if;
  if nullif(btrim(coalesce(new.challenge_title, '')), '') is not null
     and lower(btrim(new.challenge_title)) is distinct from 'this challenge'
     and lower(btrim(new.challenge_title)) is distinct from 'wallet' then
    return new;
  end if;
  select coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), ''))
    into v_title
  from public.challenges c
  where c.id = new.challenge_id;
  if v_title is not null and lower(v_title) is distinct from 'this challenge' then
    new.challenge_title := v_title;
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_ledger_fill_challenge_title on public.wallet_ledger;
create trigger wallet_ledger_fill_challenge_title
  before insert or update of challenge_id, challenge_title
  on public.wallet_ledger
  for each row execute function public.trg_wallet_ledger_challenge_title();

with updated as (
  update public.wallet_ledger w
     set challenge_title = coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), ''))
    from public.challenges c
   where w.challenge_id = c.id
     and (
       w.challenge_title is null
       or btrim(w.challenge_title) = ''
       or lower(btrim(w.challenge_title)) in ('this challenge', 'wallet')
     )
     and coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), '')) is not null
  returning w.id
)
select count(*)::int as rows_fixed
from updated;

notify pgrst, 'reload schema';

select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ex,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'write_coin_ledger';
