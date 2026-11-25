-- Optional settlement facts on the ledger. Existing amounts stay as they are.
-- People still read only their own rows. Hosts and @blob see totals, not names.

alter table public.wallet_ledger
  add column if not exists settlement_status text,
  add column if not exists available_at timestamptz,
  add column if not exists fee_cents integer,
  add column if not exists net_cents integer;

create or replace function public.challenge_settlement_aggregate(p_challenge_id uuid)
returns table (entry_count integer, gross_amount numeric, net_amount numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_ops boolean := false;
begin
  if v_uid is null or p_challenge_id is null then
    return;
  end if;
  select created_by into v_host from public.challenges where id = p_challenge_id;
  select true into v_ops
  from public.profiles
  where id = v_uid
    and (
      coalesce(is_official, false)
      or coalesce(is_admin, false)
      or lower(username) = 'blob'
    );
  if v_uid is distinct from v_host and not coalesce(v_ops, false) then
    return;
  end if;
  return query
  select
    count(*)::integer,
    coalesce(sum(amount), 0),
    coalesce(sum(coalesce(net_cents, round(amount * 100)) / 100.0), 0)
  from public.wallet_ledger
  where challenge_id = p_challenge_id
    and entry_type in ('distribute_win', 'prize', 'refund_pre_start', 'leave_refund', 'challenge_cancel_refund', 'refund_buyin');
end;
$$;

revoke all on function public.challenge_settlement_aggregate(uuid) from public, anon;
grant execute on function public.challenge_settlement_aggregate(uuid) to authenticated;
