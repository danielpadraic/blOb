-- A profile's money and its privileges are server-owned.
--
-- `profiles` carries both the wallet balance (coins, bucks, credits) and the flags that decide what
-- a person is allowed to do (is_admin, is_official, is_creator). Row level security here only ever
-- asked "is this your row?", and the client role held UPDATE on all 63 columns, so any signed-in
-- person could set their own balance to any number and switch on admin for themselves.
--
-- That was not merely cosmetic. `join_challenge_ungated` reads `profiles.coins` / `profiles.bucks`
-- to decide whether an entry fee can be paid and then debits the same column, so an invented
-- balance bought real entries into real-money challenges. `is_official` is worse still: the post
-- audience rule in `can_read_post` lets an official account's posts bypass the audience entirely.
--
-- Postgres cannot say "your row, but not these columns" inside a policy, and a column-level REVOKE
-- is silently ignored for as long as a table-level grant is present. So the table-wide grant is
-- withdrawn and the columns a person may legitimately edit about themselves are granted back by
-- name. Anything new added to this table is therefore locked by default and has to be opted in,
-- which is the safer direction for a table that holds a balance.
--
-- Every function that legitimately moves money or sets a flag -- join_challenge_ungated,
-- distribute_challenge, transfer_funds, send_coins, credit_wallet_top_up, claim_user_grant,
-- mark_coin_balance_shown and the rest -- is SECURITY DEFINER owned by postgres, so none of them
-- are affected by a change to what the client role may touch.

do $$
declare
  -- Server-owned: the client may never name these in an INSERT or UPDATE.
  protected constant text[] := array[
    'coins', 'bucks', 'credits',
    'last_shown_coin_balance', 'last_shown_bucks_balance',
    'is_admin', 'is_official', 'is_creator'
  ];
  updatable text;
  insertable text;
begin
  -- `id` is deliberately absent from the updatable list: a profile may be created with an id and
  -- never re-pointed at a different account afterwards.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into updatable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name <> 'id'
    and not (column_name = any (protected));

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into insertable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and not (column_name = any (protected));

  -- The table-level grant has to go first, otherwise the column lists below are never consulted.
  revoke update on public.profiles from authenticated, anon;
  revoke insert on public.profiles from authenticated, anon;

  execute format('grant update (%s) on public.profiles to authenticated', updatable);
  execute format('grant insert (%s) on public.profiles to authenticated', insertable);
end $$;

comment on column public.profiles.bucks is
  'PRIVATE cash balance. Server-owned: no client grant. Spend and credit only via SECURITY DEFINER RPCs.';
comment on column public.profiles.is_admin is
  'Server-owned: no client grant. Opens /admin, so it must never be self-settable.';
comment on column public.profiles.is_official is
  'Server-owned: no client grant. can_read_post lets official posts bypass the audience.';
