-- Wave-1 cash geo-fencing. Coins, social, and browsing Officials stay open.
-- Precise GPS is not collected here. Fail closed when region is unknown.

alter table public.profiles
  add column if not exists declared_region text,
  add column if not exists last_precise_region text,
  add column if not exists last_precise_at timestamptz;

comment on column public.profiles.declared_region is
  'PRIVATE USPS region (2-letter or DC/PR). Ops/eligibility only. Never a public profile badge.';
comment on column public.profiles.last_precise_region is
  'PRIVATE last precise GPS region. Set only by geo_cash_gate. Not a public badge.';
comment on column public.profiles.last_precise_at is
  'PRIVATE timestamp for last_precise_region. Fresh for 15 minutes.';

update public.profiles
set declared_region = upper(btrim(home_state))
where declared_region is null
  and nullif(upper(btrim(home_state)), '') is not null;

revoke select (declared_region, last_precise_region, last_precise_at)
  on public.profiles from anon, authenticated;
revoke update (last_precise_region, last_precise_at)
  on public.profiles from anon, authenticated;

create table if not exists public.geo_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  challenge_id uuid references public.challenges (id) on delete set null,
  declared_region text,
  precise_region text,
  ip_region text,
  effective_bucket text not null,
  allowed boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);

comment on table public.geo_decisions is
  'Append-only cash geo audit. Users read their own rows. Region is not a public badge.';

create index if not exists geo_decisions_user_id_created_idx
  on public.geo_decisions (user_id, created_at desc);

alter table public.geo_decisions enable row level security;

drop policy if exists geo_decisions_select_own on public.geo_decisions;
create policy geo_decisions_select_own
  on public.geo_decisions
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.geo_decisions from public, anon;
grant select on public.geo_decisions to authenticated;

create or replace function public.geo_normalize_region(p_region text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(upper(btrim(p_region)), '');
$$;

create or replace function public.geo_bucket_for_region(p_region text)
returns text
language sql
immutable
set search_path = public
as $$
  select case public.geo_normalize_region(p_region)
    when 'AL' then 'allow'
    when 'AK' then 'allow'
    when 'CA' then 'allow'
    when 'FL' then 'allow'
    when 'GA' then 'allow'
    when 'ID' then 'allow'
    when 'IL' then 'allow'
    when 'KS' then 'allow'
    when 'KY' then 'allow'
    when 'MA' then 'allow'
    when 'MN' then 'allow'
    when 'MO' then 'allow'
    when 'MS' then 'allow'
    when 'NC' then 'allow'
    when 'NH' then 'allow'
    when 'NM' then 'allow'
    when 'OH' then 'allow'
    when 'OK' then 'allow'
    when 'OR' then 'allow'
    when 'PA' then 'allow'
    when 'RI' then 'allow'
    when 'TX' then 'allow'
    when 'VT' then 'allow'
    when 'VA' then 'allow'
    when 'WV' then 'allow'
    when 'WI' then 'allow'
    when 'WY' then 'allow'
    when 'DC' then 'allow'
    when 'AR' then 'limited'
    when 'CO' then 'limited'
    when 'HI' then 'limited'
    when 'IN' then 'limited'
    when 'IA' then 'limited'
    when 'MD' then 'limited'
    when 'NE' then 'limited'
    when 'NJ' then 'limited'
    when 'NY' then 'limited'
    when 'ND' then 'limited'
    when 'SC' then 'limited'
    when 'UT' then 'limited'
    when 'WA' then 'limited'
    when 'AZ' then 'blocked'
    when 'CT' then 'blocked'
    when 'DE' then 'blocked'
    when 'LA' then 'blocked'
    when 'ME' then 'blocked'
    when 'MI' then 'blocked'
    when 'MT' then 'blocked'
    when 'NV' then 'blocked'
    when 'SD' then 'blocked'
    when 'TN' then 'blocked'
    when 'PR' then 'blocked'
    else 'blocked'
  end;
$$;

create or replace function public.geo_challenge_money_shape(
  p_currency text,
  p_entry numeric,
  p_prize numeric,
  p_guarantee numeric,
  p_host_funded boolean default false,
  p_is_callout boolean default false
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_cash boolean := lower(coalesce(p_currency, 'coins')) = 'bucks';
  v_entry numeric := greatest(coalesce(p_entry, 0), 0);
  v_prize numeric := greatest(coalesce(p_prize, 0), 0);
  v_guarantee numeric := greatest(coalesce(p_guarantee, 0), 0);
  v_posted boolean := v_guarantee > 0 or (coalesce(p_host_funded, false) and v_prize > 0);
begin
  if p_is_callout and v_cash then
    return 'call';
  end if;
  if not v_cash then
    return 'free';
  end if;
  if v_entry <= 0 and v_prize <= 0 and not v_posted then
    return 'free';
  end if;
  if v_entry > 0 and not v_posted then
    return 'pool';
  end if;
  if v_entry > 0 and v_posted then
    return 'hybrid';
  end if;
  return 'host';
end;
$$;

create or replace function public.geo_join_action_for_shape(p_shape text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_shape
    when 'host' then 'join_host'
    when 'hybrid' then 'join_hybrid'
    when 'pool' then 'join_pool'
    when 'call' then 'call'
    else null
  end;
$$;

create or replace function public.geo_create_action_for_shape(p_shape text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_shape
    when 'host' then 'create_host'
    when 'hybrid' then 'create_hybrid'
    when 'pool' then 'create_pool'
    when 'call' then 'call'
    else null
  end;
$$;

create or replace function public.geo_cash_gate(
  p_action text,
  p_challenge_id uuid default null,
  p_precise_region text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_declared text;
  v_precise text;
  v_ip text := null;
  v_last_precise text;
  v_last_precise_at timestamptz;
  v_bucket text := 'blocked';
  v_has_region boolean := false;
  v_allowed boolean := false;
  v_reason text := 'need_region';
  v_copy text := 'Sorry, this Challenge isn’t available in your State.';
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_region text;
  v_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select
    public.geo_normalize_region(coalesce(declared_region, home_state)),
    public.geo_normalize_region(last_precise_region),
    last_precise_at
  into v_declared, v_last_precise, v_last_precise_at
  from public.profiles
  where id = v_uid;

  v_precise := public.geo_normalize_region(p_precise_region);
  if v_precise is null
     and v_last_precise is not null
     and v_last_precise_at is not null
     and v_last_precise_at > now() - interval '15 minutes' then
    v_precise := v_last_precise;
  end if;

  v_bucket := null;
  v_has_region := false;
  foreach v_region in array array[v_declared, v_precise]
  loop
    v_code := public.geo_normalize_region(v_region);
    if v_code is null then
      continue;
    end if;
    v_has_region := true;
    if public.geo_bucket_for_region(v_code) = 'blocked' then
      v_bucket := 'blocked';
      exit;
    elsif public.geo_bucket_for_region(v_code) = 'limited' then
      v_bucket := 'limited';
    elsif v_bucket is distinct from 'limited' then
      v_bucket := 'allow';
    end if;
  end loop;
  if not v_has_region then
    v_bucket := 'blocked';
  end if;

  if v_action in ('create_pool', 'join_pool', 'call') then
    v_allowed := false;
    v_reason := 'product_off';
  elsif not v_has_region then
    v_allowed := false;
    v_reason := 'need_region';
  elsif v_bucket = 'blocked' then
    v_allowed := false;
    v_reason := 'blocked';
  elsif v_bucket = 'limited' and v_action in ('join_hybrid', 'create_hybrid') then
    v_allowed := false;
    v_reason := 'limited';
  elsif v_action in (
    'join_host', 'create_host', 'join_hybrid', 'create_hybrid', 'cashout'
  ) then
    v_allowed := true;
    v_reason := 'ok';
  else
    v_allowed := false;
    v_reason := 'blocked';
  end if;

  if v_allowed and public.geo_normalize_region(p_precise_region) is not null then
    update public.profiles
    set last_precise_region = public.geo_normalize_region(p_precise_region),
        last_precise_at = now()
    where id = v_uid;
  end if;

  insert into public.geo_decisions (
    user_id, action, challenge_id, declared_region, precise_region, ip_region,
    effective_bucket, allowed, reason
  ) values (
    v_uid, v_action, p_challenge_id, v_declared, v_precise, v_ip,
    v_bucket, v_allowed, v_reason
  );

  return jsonb_build_object(
    'allowed', v_allowed,
    'bucket', v_bucket,
    'reason', v_reason,
    'copy', v_copy
  );
end;
$$;

revoke all on function public.geo_cash_gate(text, uuid, text) from public, anon;
grant execute on function public.geo_cash_gate(text, uuid, text) to authenticated;

create or replace function public.assert_geo_cash_gate(
  p_action text,
  p_challenge_id uuid default null,
  p_precise_region text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate jsonb;
begin
  v_gate := public.geo_cash_gate(p_action, p_challenge_id, p_precise_region);
  if not coalesce((v_gate->>'allowed')::boolean, false) then
    raise exception '%', coalesce(nullif(v_gate->>'reason', ''), 'GEO_BLOCKED');
  end if;
  return v_gate;
end;
$$;

revoke all on function public.assert_geo_cash_gate(text, uuid, text) from public, anon, authenticated;

-- Official allow-list (per-challenge) also reads declared_region.
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
  select public.geo_normalize_region(coalesce(declared_region, home_state))
    into v_state
  from public.profiles
  where id = p_user_id;
  if v_state is null then
    return false;
  end if;
  return exists (
    select 1 from unnest(v_states) as s
    where public.geo_normalize_region(s) = v_state
  );
end;
$$;

grant execute on function public.challenge_available_in_jurisdiction(uuid, uuid) to authenticated, anon;

-- Wrap live cash RPCs. Inner bodies stay as they are.

do $$
begin
  if to_regprocedure('public.join_challenge_ungated(uuid)') is null
     and to_regprocedure('public.join_challenge(uuid)') is not null then
    alter function public.join_challenge(uuid) rename to join_challenge_ungated;
  end if;
end $$;

create or replace function public.join_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_shape text;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  v_shape := public.geo_challenge_money_shape(
    v_c.currency,
    v_c.buy_in_amount,
    v_c.prize_pool,
    greatest(coalesce(v_c.host_budget, 0), coalesce(v_c.creator_contribution, 0), 0),
    coalesce(v_c.host_funded, false),
    coalesce(v_c.is_callout, false)
  );
  v_action := public.geo_join_action_for_shape(v_shape);
  if v_action is not null then
    perform public.assert_geo_cash_gate(v_action, p_challenge_id, null);
  end if;
  return public.join_challenge_ungated(p_challenge_id);
end;
$$;

revoke all on function public.join_challenge_ungated(uuid) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.publish_challenge_ungated(jsonb)') is null
     and to_regprocedure('public.publish_challenge(jsonb)') is not null then
    alter function public.publish_challenge(jsonb) rename to publish_challenge_ungated;
  end if;
end $$;

create or replace function public.publish_challenge(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_buy_in numeric;
  v_host numeric;
  v_lane text;
  v_privacy text;
  v_shape text;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_currency := lower(coalesce(nullif(p_payload->>'currency', ''), 'coins'));
  v_buy_in := coalesce((p_payload->>'buy_in_amount')::numeric, 0);
  v_host := greatest(
    coalesce((p_payload->>'creator_contribution')::numeric, 0),
    coalesce((p_payload->>'host_budget')::numeric, 0),
    0
  );
  v_lane := lower(coalesce(nullif(p_payload->>'challenge_lane', ''), 'coins'));
  v_privacy := lower(coalesce(p_payload->>'privacy_mode', ''));
  if v_lane = 'private' or v_privacy in ('private', 'private_corporate') then
    v_buy_in := 0;
  end if;
  -- Live publish still host-funds cash user challenges (entry forced to 0).
  if v_currency = 'bucks' then
    v_buy_in := 0;
  end if;
  v_shape := public.geo_challenge_money_shape(
    v_currency, v_buy_in, v_host, v_host, v_host > 0, false
  );
  v_action := public.geo_create_action_for_shape(v_shape);
  if v_action is not null then
    perform public.assert_geo_cash_gate(v_action, null, null);
  end if;
  return public.publish_challenge_ungated(p_payload);
end;
$$;

revoke all on function public.publish_challenge_ungated(jsonb) from public, anon, authenticated;
grant execute on function public.publish_challenge(jsonb) to authenticated;

do $$
begin
  if to_regprocedure('public.top_up_challenge_prize_ungated(uuid, numeric, uuid)') is null
     and to_regprocedure('public.top_up_challenge_prize(uuid, numeric, uuid)') is not null then
    alter function public.top_up_challenge_prize(uuid, numeric, uuid)
      rename to top_up_challenge_prize_ungated;
  end if;
end $$;

create or replace function public.top_up_challenge_prize(
  p_challenge_id uuid,
  p_amount numeric,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  if lower(coalesce(v_c.currency, 'coins')) = 'bucks' then
    perform public.assert_geo_cash_gate('create_host', p_challenge_id, null);
  end if;
  return public.top_up_challenge_prize_ungated(p_challenge_id, p_amount, p_request_id);
end;
$$;

revoke all on function public.top_up_challenge_prize_ungated(uuid, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.top_up_challenge_prize(uuid, numeric, uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.create_callout_ungated(uuid, numeric, text, text, timestamptz, jsonb, text)') is null
     and to_regprocedure('public.create_callout(uuid, numeric, text, text, timestamptz, jsonb, text)') is not null then
    alter function public.create_callout(uuid, numeric, text, text, timestamptz, jsonb, text)
      rename to create_callout_ungated;
  end if;
end $$;

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_amount numeric,
  p_currency text,
  p_win_condition text,
  p_deadline timestamptz,
  p_proofs jsonb,
  p_format text
)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if public.normalize_wallet_currency(p_currency) = 'bucks' then
    perform public.assert_geo_cash_gate('call', null, null);
  end if;
  return public.create_callout_ungated(
    p_opponent_id, p_amount, p_currency, p_win_condition, p_deadline, p_proofs, p_format
  );
end;
$$;

revoke all on function public.create_callout_ungated(uuid, numeric, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz, jsonb, text)
  to authenticated;

do $$
begin
  if to_regprocedure('public.create_callout_legacy_ungated(uuid, text, text, text, numeric)') is null
     and to_regprocedure('public.create_callout(uuid, text, text, text, numeric)') is not null then
    alter function public.create_callout(uuid, text, text, text, numeric)
      rename to create_callout_legacy_ungated;
  end if;
end $$;

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_title text,
  p_description text,
  p_currency text,
  p_stake_amount numeric
)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if public.normalize_wallet_currency(p_currency) = 'bucks' then
    perform public.assert_geo_cash_gate('call', null, null);
  end if;
  return public.create_callout_legacy_ungated(
    p_opponent_id, p_title, p_description, p_currency, p_stake_amount
  );
end;
$$;

revoke all on function public.create_callout_legacy_ungated(uuid, text, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.create_callout(uuid, text, text, text, numeric) to authenticated;

do $$
begin
  if to_regprocedure('public.accept_callout_ungated(uuid)') is null
     and to_regprocedure('public.accept_callout(uuid)') is not null then
    alter function public.accept_callout(uuid) rename to accept_callout_ungated;
  end if;
end $$;

create or replace function public.accept_callout(p_callout_id uuid)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.callouts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.callouts where id = p_callout_id;
  if found and coalesce(v_row.currency, 'coins') = 'bucks' then
    perform public.assert_geo_cash_gate('call', v_row.challenge_id, null);
  end if;
  return public.accept_callout_ungated(p_callout_id);
end;
$$;

revoke all on function public.accept_callout_ungated(uuid) from public, anon, authenticated;
grant execute on function public.accept_callout(uuid) to authenticated;

notify pgrst, 'reload schema';
