-- blOb ops — invite links have no token (Sep 22)
--
-- WHAT IS BROKEN
-- Share -> Copy Link on a private / private_corporate challenge says
-- "Couldn’t copy that invite."
--
-- It is NOT the clipboard and it is NOT a permission error.
-- public.challenge_invites.token is a nullable text column with NO default,
-- and mint_challenge_invite_link inserts (challenge_id, inviter_id,
-- invitee_id, status) without ever setting it. So the RPC succeeds, returns
-- HTTP 200 with "token": null, and the app throws on the empty token.
-- Every one of the 19 invite rows in this project has token = null.
--
-- WHAT THIS CHANGES
-- 1. token gets a default, a backfill, and a unique index. It can never be
--    null again.
-- 2. mint_challenge_invite_link reuses ONE live invite per challenge instead
--    of one per inviter, so every tap hands out the same link.
-- 3. Host / assigned mod / @blob may CREATE the first token. Anyone else on
--    the roster may only COPY an existing one, and gets reason 'ask_host'
--    instead of a fake failure.
-- 4. An RLS SELECT policy lets the roster read the one active invite row.
--    Invite rows are NOT opened to the public.
--
-- Scoring, Board, theme, settlement, and Join are untouched.
-- This is a data + function fix. Do NOT run supabase db push.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if asked. You want an empty box and a green Run button.
--
-- 3. SCRIPT A (look first). In Cursor select from "-- SCRIPT A" down to the
--    line above "-- SCRIPT B". Copy, paste, green Run.
--    DONE WHEN one row shows:
--        invites_total          19
--        invites_missing_token  19
--        live_row_invites       2
--        live_row_has_token     false
--    That "false" is the bug. If live_row_has_token is already true, stop and
--    tell Cursor — someone fixed it already.
--
-- 4. SCRIPT B (the fix). Click "New query" for a clean box. Select from
--    "-- SCRIPT B" down to the line above "-- SCRIPT C". Copy, paste,
--    green Run.
--    DONE WHEN the box says Success with no rows returned.
--    Supabase may show a yellow "Potential issues" card saying this changes
--    data or alters a table. That is expected — Script B is meant to write.
--    Click the confirm / Run button on that card.
--    If the card offers "Run without RLS" or "Run and enable RLS", click
--    Cancel and tell Cursor.
--
-- 5. SCRIPT C (prove it). "New query" again. Select from "-- SCRIPT C" to the
--    end of the file. Copy, paste, green Run.
--    DONE WHEN the single row reads:
--        invites_missing_token   0
--        live_row_has_token      true
--        live_row_live_invites   1
--        token_is_unique         true
--        roster_read_policy      true
--    Copy the value of live_invite_url and keep it — that is the exact link
--    Copy Link will now hand out.
--
-- 6. Phone Safari, https://blob.mobi, signed in as @danielharder.
--    Open Rookies vs. Veterans -> Share -> Copy Link.
--    You should see "Link copied". Paste into Notes. It must look like
--    https://blob.mobi/challenges/16af3e82-.../?invite=<long code>
--    and it must match live_invite_url from step 5.


-- =============================================================================
-- SCRIPT A — preview (read only, changes nothing)
-- =============================================================================
select
  (select count(*) from public.challenge_invites) as invites_total,
  (select count(*) from public.challenge_invites where token is null) as invites_missing_token,
  (select count(*)
     from public.challenge_invites
    where challenge_id = '16af3e82-15c0-479f-af52-328440b0c87e') as live_row_invites,
  exists (
    select 1 from public.challenge_invites
    where challenge_id = '16af3e82-15c0-479f-af52-328440b0c87e'
      and invitee_id is null
      and status = 'pending'
      and token is not null
  ) as live_row_has_token,
  (select column_default from information_schema.columns
    where table_schema = 'public'
      and table_name = 'challenge_invites'
      and column_name = 'token') as token_default_today;


-- =============================================================================
-- SCRIPT B — the fix
-- =============================================================================

-- 1. A token can never be null again.
alter table public.challenge_invites
  alter column token set default encode(gen_random_bytes(16), 'hex');

update public.challenge_invites
   set token = encode(gen_random_bytes(16), 'hex')
 where token is null;

create unique index if not exists challenge_invites_token_uidx
  on public.challenge_invites (token)
  where token is not null;

-- 2. The roster may read the one active share invite. Not the public.
drop policy if exists "Roster reads the live invite" on public.challenge_invites;
create policy "Roster reads the live invite"
  on public.challenge_invites
  for select
  to authenticated
  using (
    invitee_id is null
    and status = 'pending'
    and (
      public.is_official_ops()
      or exists (
        select 1 from public.challenges c
        where c.id = challenge_invites.challenge_id
          and c.created_by = auth.uid()
      )
      or exists (
        select 1 from public.challenge_moderators m
        where m.challenge_id = challenge_invites.challenge_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.challenge_participants p
        where p.challenge_id = challenge_invites.challenge_id
          and p.user_id = auth.uid()
      )
    )
  );

-- 3. One live invite per challenge. Host / mod / @blob create it. Roster copies it.
create or replace function public.mint_challenge_invite_link(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
  v_status text;
  v_may_create boolean;
  v_on_roster boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to copy this invite.' using errcode = '42501';
  end if;
  if p_challenge_id is null then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  v_may_create :=
    public.is_official_ops()
    or v_c.created_by = v_uid
    or exists (
      select 1 from public.challenge_moderators m
      where m.challenge_id = p_challenge_id and m.user_id = v_uid
    );

  v_on_roster := exists (
    select 1 from public.challenge_participants p
    where p.challenge_id = p_challenge_id and p.user_id = v_uid
  );

  if not v_may_create and not v_on_roster then
    raise exception 'You do not have access to this invite.' using errcode = '42501';
  end if;

  -- Reuse the oldest live share invite so the link stays stable for everyone.
  select * into v_invite
  from public.challenge_invites
  where challenge_id = p_challenge_id
    and invitee_id is null
    and status = 'pending'
    and token is not null
  order by created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'created', false,
      'invite_id', v_invite.id,
      'challenge_id', v_invite.challenge_id,
      'token', v_invite.token
    );
  end if;

  if not v_may_create then
    return jsonb_build_object('ok', false, 'reason', 'ask_host');
  end if;

  -- Adopt a tokenless row before adding another one.
  update public.challenge_invites
     set token = encode(gen_random_bytes(16), 'hex')
   where id = (
     select id from public.challenge_invites
     where challenge_id = p_challenge_id
       and invitee_id is null
       and status = 'pending'
       and token is null
     order by created_at asc
     limit 1
   )
  returning * into v_invite;

  if v_invite.id is null then
    insert into public.challenge_invites (
      challenge_id, inviter_id, invitee_id, status, token
    ) values (
      p_challenge_id, v_uid, null, 'pending', encode(gen_random_bytes(16), 'hex')
    )
    returning * into v_invite;
  end if;

  return jsonb_build_object(
    'ok', true, 'created', true,
    'invite_id', v_invite.id,
    'challenge_id', v_invite.challenge_id,
    'token', v_invite.token
  );
end;
$$;

revoke all on function public.mint_challenge_invite_link(uuid) from public, anon;
grant execute on function public.mint_challenge_invite_link(uuid) to authenticated, service_role;

comment on function public.mint_challenge_invite_link(uuid) is
  'One live share invite per challenge. Host / mod / @blob create it; roster copies it. Returns ok:false reason:ask_host when the roster has nothing to copy yet.';


-- =============================================================================
-- SCRIPT C — verify (read only, changes nothing)
-- =============================================================================
select
  (select count(*) from public.challenge_invites where token is null) as invites_missing_token,
  exists (
    select 1 from public.challenge_invites
    where challenge_id = '16af3e82-15c0-479f-af52-328440b0c87e'
      and invitee_id is null and status = 'pending' and token is not null
  ) as live_row_has_token,
  (select count(*) from public.challenge_invites
    where challenge_id = '16af3e82-15c0-479f-af52-328440b0c87e'
      and invitee_id is null and status = 'pending' and token is not null) as live_row_live_invites,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'challenge_invites'
      and indexname = 'challenge_invites_token_uidx'
  ) as token_is_unique,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'challenge_invites'
      and policyname = 'Roster reads the live invite'
  ) as roster_read_policy,
  (
    select 'https://blob.mobi/challenges/16af3e82-15c0-479f-af52-328440b0c87e?invite=' || i.token
    from public.challenge_invites i
    where i.challenge_id = '16af3e82-15c0-479f-af52-328440b0c87e'
      and i.invitee_id is null and i.status = 'pending' and i.token is not null
    order by i.created_at asc
    limit 1
  ) as live_invite_url;
