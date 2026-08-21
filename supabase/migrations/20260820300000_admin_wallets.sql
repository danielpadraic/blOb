-- Live wallet balances for Official Pulse. Not a snapshot.
-- Only is_official / is_admin / @blob / Official Bob may execute.

create or replace function public.admin_wallets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.is_official_viewer() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  into v_rows
  from (
    select
      p.id,
      p.username,
      p.display_name,
      coalesce(p.coins, p.credits, 0) as coins,
      coalesce(p.bucks, 0) as bucks
    from public.profiles p
    order by coalesce(p.coins, p.credits, 0) desc, lower(coalesce(p.username, ''))
  ) x;

  return v_rows;
end;
$$;

revoke all on function public.admin_wallets() from public, anon;
grant execute on function public.admin_wallets() to authenticated;

notify pgrst, 'reload schema';
