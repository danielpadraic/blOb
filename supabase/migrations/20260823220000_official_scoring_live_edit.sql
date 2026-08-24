-- Live-edit Comparable Points. New version only. Never touch historical check-ins.

alter table public.challenges
  add column if not exists scoring_version integer,
  add column if not exists comparable_points_config jsonb,
  add column if not exists scoring_config jsonb,
  add column if not exists scoring_method text;

create table if not exists public.challenge_scoring_audit (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  version integer not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  summary text,
  config_snapshot jsonb
);

create index if not exists challenge_scoring_audit_challenge_idx
  on public.challenge_scoring_audit (challenge_id, version desc);

alter table public.challenge_scoring_audit enable row level security;

drop policy if exists "Staff and participants read scoring audit" on public.challenge_scoring_audit;
create policy "Staff and participants read scoring audit"
  on public.challenge_scoring_audit for select
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_scoring_audit.challenge_id
        and (
          c.created_by = auth.uid()
          or exists (
            select 1 from public.challenge_participants p
            where p.challenge_id = c.id and p.user_id = auth.uid()
          )
          or exists (
            select 1 from public.profiles pr
            where pr.id = auth.uid()
              and (coalesce(pr.is_official, false) or coalesce(pr.is_admin, false))
          )
        )
    )
  );

revoke insert, update, delete on public.challenge_scoring_audit from anon, authenticated;
grant select on public.challenge_scoring_audit to authenticated;

create or replace function public.publish_scoring_change(
  p_challenge_id uuid,
  p_config jsonb,
  p_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_staff boolean := false;
  v_new int;
  v_config jsonb;
  v_current int;
  v_has_config boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(is_official, false) or coalesce(is_admin, false)
    into v_staff
    from public.profiles
    where id = v_uid;
  v_staff := coalesce(v_staff, false);

  if ch.created_by is distinct from v_uid and not v_staff then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if ch.status in ('settled', 'cancelled', 'cancelled_underfilled', 'distributing') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'INVALID_SCORING';
  end if;
  if coalesce(nullif(p_config->>'parity_points', '')::int, 0) < 1 then
    raise exception 'INVALID_SCORING';
  end if;
  if coalesce(jsonb_array_length(coalesce(p_config->'activities', '[]'::jsonb)), 0) < 1 then
    raise exception 'INVALID_SCORING';
  end if;

  v_has_config :=
    ch.comparable_points_config is not null
    or ch.scoring_config is not null;
  v_current := greatest(
    coalesce(ch.scoring_version, 1),
    coalesce(nullif(ch.comparable_points_config->>'version', '')::int, 1),
    coalesce(nullif(ch.scoring_config->>'version', '')::int, 1)
  );
  if v_has_config then
    v_new := v_current + 1;
  else
    v_new := 1;
  end if;

  v_config := jsonb_set(p_config, '{version}', to_jsonb(v_new), true);

  update public.challenges
  set
    scoring_method = 'comparable_points',
    scoring_version = v_new,
    comparable_points_config = v_config,
    scoring_config = v_config,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  insert into public.challenge_scoring_audit (
    challenge_id, version, changed_by, summary, config_snapshot
  ) values (
    p_challenge_id,
    v_new,
    v_uid,
    nullif(btrim(coalesce(p_summary, '')), ''),
    v_config
  );

  return jsonb_build_object(
    'ok', true,
    'version', v_new,
    'scoring_version', v_new,
    'challenge_id', ch.id,
    'comparable_points_config', v_config,
    'scoring_config', v_config
  );
end;
$$;

grant execute on function public.publish_scoring_change(uuid, jsonb, text) to authenticated;
