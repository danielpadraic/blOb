-- Coin even-split: floor(pool / n) plus leftover coins on the first winners.
-- Sum(shares) == pool. Bucks cents split is unchanged. WTA / top-places untouched.

create or replace function public.even_split_shares(
  p_pool numeric,
  p_count int,
  p_currency text default 'coins'
)
returns numeric[]
language plpgsql
immutable
as $$
declare
  v_share numeric;
  v_left numeric;
  v_i int;
  v_out numeric[] := '{}';
  v_pool numeric;
begin
  if p_count is null or p_count <= 0 then
    return '{}';
  end if;

  if coalesce(p_currency, 'coins') is distinct from 'bucks' then
    v_pool := floor(greatest(coalesce(p_pool, 0), 0));
    if v_pool <= 0 then
      return '{}';
    end if;
    v_share := floor(v_pool / p_count);
    v_left := v_pool - (v_share * p_count);
    for v_i in 1..p_count loop
      v_out := v_out || (v_share + case when v_i <= v_left then 1 else 0 end);
    end loop;
    return v_out;
  end if;

  v_pool := round(coalesce(p_pool, 0), 2);
  v_share := round(v_pool / p_count, 2);
  v_left := round(v_pool - (v_share * p_count), 2);
  for v_i in 1..p_count loop
    v_out := v_out || (v_share + case when v_i = p_count then v_left else 0 end);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.even_split_shares(numeric, int, text) from public;
grant execute on function public.even_split_shares(numeric, int, text) to anon, authenticated, service_role;
