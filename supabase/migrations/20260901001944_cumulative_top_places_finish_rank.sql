-- Cumulative Top # / Top %: rank by completed_at. Top % uses the starting field.
-- Same-second ties share the cut. No first_to / first_n columns.

create or replace function public.settlement_cumulative_winner_ids(
  p_challenge_id uuid,
  p_challenge public.challenges
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_structure text := lower(coalesce((p_challenge).prize_structure, 'equal_split'));
  v_payout text := lower(coalesce((p_challenge).payout_mode, ''));
  v_slots int;
  v_pool_n int;
  v_cut timestamptz;
  v_winners uuid[] := '{}';
begin
  select coalesce(array_agg(p.user_id order by date_trunc('second', p.completed_at), p.joined_at, p.user_id), '{}')
    into v_winners
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and p.completed_at is not null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed');

  if v_structure = 'top_places' or v_payout = 'top_places' then
    select count(*)::int
      into v_pool_n
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
      and p.joined_at <= coalesce((p_challenge).starts_at, p.joined_at);
    if v_pool_n is null or v_pool_n <= 0 then
      select count(*)::int
        into v_pool_n
      from public.challenge_participants p
      where p.challenge_id = p_challenge_id
        and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start';
    end if;
    if lower(coalesce((p_challenge).top_places_mode, 'count')) = 'percent' then
      v_slots := greatest(1, ceil(greatest(v_pool_n, 0) * greatest(coalesce((p_challenge).top_places_value, 25), 0) / 100.0));
    else
      v_slots := greatest(1, floor(greatest(coalesce((p_challenge).top_places_value, 3), 1)));
    end if;
    if coalesce(array_length(v_winners, 1), 0) > v_slots then
      select date_trunc('second', p.completed_at)
        into v_cut
      from public.challenge_participants p
      where p.user_id = v_winners[v_slots]
        and p.challenge_id = p_challenge_id;
      select coalesce(array_agg(x.user_id order by x.ord), '{}')
        into v_winners
      from unnest(v_winners) with ordinality as x(user_id, ord)
      join public.challenge_participants p
        on p.challenge_id = p_challenge_id and p.user_id = x.user_id
      where date_trunc('second', p.completed_at) <= v_cut;
    end if;
  end if;

  return v_winners;
end;
$$;

revoke all on function public.settlement_cumulative_winner_ids(uuid, public.challenges) from public, anon;
grant execute on function public.settlement_cumulative_winner_ids(uuid, public.challenges) to authenticated, service_role;
