-- Live compat for week_10: add Simple/Official columns the first series migration assumed.
-- Does not change user-created settle math.

alter table public.challenges
  add column if not exists host_funded boolean not null default false,
  add column if not exists host_budget numeric not null default 0,
  add column if not exists format text not null default 'consistency',
  add column if not exists task text,
  add column if not exists required_checkins int,
  add column if not exists misses_allowed int not null default 0,
  add column if not exists proof_type text not null default 'photo',
  add column if not exists proof_review text not null default 'auto',
  add column if not exists payout_mode text not null default 'even_split_remaining',
  add column if not exists timezone text,
  add column if not exists start_rule text not null default 'legacy',
  add column if not exists proofs jsonb not null default '[]'::jsonb,
  add column if not exists discoverability text,
  add column if not exists allowed_states text[],
  add column if not exists length_value int,
  add column if not exists length_unit text;

alter table public.profiles
  add column if not exists home_state text;

create or replace function public.challenge_available_in_jurisdiction(
  p_challenge_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_official boolean;
  v_states text[];
  v_state text;
begin
  select is_official, allowed_states
    into v_official, v_states
  from public.challenges
  where id = p_challenge_id;
  if not found then
    return false;
  end if;
  if not v_official then
    return true;
  end if;
  if v_states is null or coalesce(array_length(v_states, 1), 0) = 0 then
    return true;
  end if;
  if p_user_id is null then
    return false;
  end if;
  select nullif(upper(btrim(home_state)), '') into v_state
  from public.profiles
  where id = p_user_id;
  if v_state is null then
    return false;
  end if;
  return exists (
    select 1 from unnest(v_states) as s
    where upper(btrim(s)) = v_state
  );
end;
$$;

grant execute on function public.challenge_available_in_jurisdiction(uuid, uuid) to authenticated, anon;

do $$
begin
  perform public.tick_official_series();
exception when others then
  raise notice 'official series tick skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
