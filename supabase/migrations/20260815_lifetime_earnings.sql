-- Public lifetime earnings (Coins and Bucks kept separate).
-- Includes challenge payouts and settled call-out prizes.
-- Safe to re-run.

create or replace function public.lifetime_earnings(p_user_id uuid)
returns table (
  coins numeric,
  bucks numeric,
  callout_wins int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    round(
      coalesce((
        select sum(p.amount)
        from public.challenge_payouts p
        join public.challenges c on c.id = p.challenge_id
        where p.user_id = p_user_id
          and public.normalize_wallet_currency(c.currency) = 'coins'
      ), 0)
      + coalesce((
        select sum(co.stake_amount * 2)
        from public.callouts co
        where co.winner_id = p_user_id
          and co.status = 'settled'
          and public.normalize_wallet_currency(co.currency) = 'coins'
      ), 0)
    , 2) as coins,
    round(
      coalesce((
        select sum(p.amount)
        from public.challenge_payouts p
        join public.challenges c on c.id = p.challenge_id
        where p.user_id = p_user_id
          and public.normalize_wallet_currency(c.currency) = 'bucks'
      ), 0)
      + coalesce((
        select sum(co.stake_amount * 2)
        from public.callouts co
        where co.winner_id = p_user_id
          and co.status = 'settled'
          and public.normalize_wallet_currency(co.currency) = 'bucks'
      ), 0)
    , 2) as bucks,
    coalesce((
      select count(*)::int
      from public.callouts co
      where co.winner_id = p_user_id
        and co.status = 'settled'
    ), 0) as callout_wins;
$$;

comment on function public.lifetime_earnings(uuid) is
  'Public lifetime winnings. Coins and Bucks are never mixed. Includes challenge payouts and settled call-out pots.';

grant execute on function public.lifetime_earnings(uuid) to anon, authenticated;
